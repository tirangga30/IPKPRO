<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Semester;
use App\Services\WorkspaceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CourseController extends Controller
{
    public function store(Request $request, Semester $semester, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        if ((int) $semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:32'],
            'name' => ['nullable', 'string', 'max:200'],
            'sks' => ['sometimes', 'numeric', 'min:0', 'max:24'],
            'numericScore' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'grade' => ['nullable', 'string', 'max:16'],
            'included' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ]);

        $nextOrder = isset($validated['sortOrder'])
            ? (int) $validated['sortOrder']
            : ((int) $semester->courses()->max('sort_order')) + 1;

        $course = $semester->courses()->create([
            'code' => (string) ($validated['code'] ?? ''),
            'name' => (string) ($validated['name'] ?? ''),
            'sks' => (float) ($validated['sks'] ?? 3),
            'numeric_score' => $validated['numericScore'] ?? null,
            'grade' => (string) ($validated['grade'] ?? ''),
            'included' => ($validated['included'] ?? true) !== false,
            'sort_order' => $nextOrder,
        ]);

        if ($semester->collapsed) {
            $semester->update(['collapsed' => false]);
        }

        return response()->json(['course' => $this->formatCourse($course)], 201);
    }

    public function update(Request $request, Course $course, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        $course->loadMissing('semester');
        if (!$course->semester || (int) $course->semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'code' => ['sometimes', 'nullable', 'string', 'max:32'],
            'name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'sks' => ['sometimes', 'numeric', 'min:0', 'max:24'],
            'numericScore' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'grade' => ['sometimes', 'nullable', 'string', 'max:16'],
            'included' => ['sometimes', 'boolean'],
        ]);

        $updates = [];
        if (array_key_exists('code', $validated)) {
            $updates['code'] = (string) ($validated['code'] ?? '');
        }
        if (array_key_exists('name', $validated)) {
            $updates['name'] = (string) ($validated['name'] ?? '');
        }
        if (array_key_exists('sks', $validated)) {
            $updates['sks'] = (float) $validated['sks'];
        }
        if (array_key_exists('numericScore', $validated)) {
            $updates['numeric_score'] = $validated['numericScore'];
        }
        if (array_key_exists('grade', $validated)) {
            $updates['grade'] = (string) ($validated['grade'] ?? '');
        }
        if (array_key_exists('included', $validated)) {
            $updates['included'] = (bool) $validated['included'];
        }

        if (!empty($updates)) {
            $course->update($updates);
        }

        return response()->json(['course' => $this->formatCourse($course->fresh())]);
    }

    public function destroy(Request $request, Course $course, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        $course->loadMissing('semester');
        if (!$course->semester || (int) $course->semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $course->delete();

        return response()->json(['ok' => true]);
    }

    private function formatCourse(Course $c): array
    {
        return [
            'id' => (string) $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'sks' => (float) $c->sks,
            'grade' => $c->grade,
            'numericScore' => $c->numeric_score !== null ? (float) $c->numeric_score : null,
            'included' => (bool) $c->included,
        ];
    }
}
