<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Semester;
use App\Services\WorkspaceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SemesterController extends Controller
{
    public function store(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'period' => ['nullable', 'string', 'max:120'],
            'withInitialCourse' => ['sometimes', 'boolean'],
        ]);

        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);

        $nextOrder = ((int) $profile->semesters()->max('sort_order')) + 1;
        $count = $profile->semesters()->count() + 1;

        $semester = DB::transaction(function () use ($profile, $validated, $nextOrder, $count): Semester {
            $sem = $profile->semesters()->create([
                'name' => trim((string) ($validated['name'] ?? '')) ?: ('Semester ' . $count),
                'period' => $validated['period'] ?? ($count % 2 === 1 ? 'Ganjil' : 'Genap'),
                'sort_order' => $nextOrder,
                'collapsed' => false,
            ]);

            if ($validated['withInitialCourse'] ?? true) {
                $sem->courses()->create([
                    'code' => '',
                    'name' => '',
                    'sks' => 3,
                    'numeric_score' => null,
                    'grade' => '',
                    'included' => true,
                    'sort_order' => 0,
                ]);
            }

            return $sem->load('courses');
        });

        $resp = response()->json([
            'semester' => $this->formatSemester($semester),
        ], 201);

        if ($newGuestToken !== null) {
            $resp->withCookie(cookie(
                WorkspaceManager::WORKSPACE_COOKIE,
                $newGuestToken,
                60 * 24 * 365,
                '/',
                null,
                $request->isSecure(),
                true,
                false,
                'Lax'
            ));
        }

        return $resp;
    }

    public function update(Request $request, Semester $semester, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        if ((int) $semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'period' => ['sometimes', 'nullable', 'string', 'max:120'],
            'collapsed' => ['sometimes', 'boolean'],
        ]);

        $updates = [];
        if (array_key_exists('name', $validated)) {
            $updates['name'] = trim($validated['name']) !== '' ? $validated['name'] : $semester->name;
        }
        if (array_key_exists('period', $validated)) {
            $updates['period'] = (string) ($validated['period'] ?? '');
        }
        if (array_key_exists('collapsed', $validated)) {
            $updates['collapsed'] = (bool) $validated['collapsed'];
        }

        if (!empty($updates)) {
            $semester->update($updates);
        }

        return response()->json(['semester' => $this->formatSemester($semester->load('courses'))]);
    }

    public function toggleAll(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'collapsed' => ['required', 'boolean'],
        ]);

        $profile = $workspace->resolveProfile($request);
        $profile->semesters()->update(['collapsed' => (bool) $validated['collapsed']]);

        return response()->json(['ok' => true]);
    }

    public function reorder(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'integer'],
        ]);

        $profile = $workspace->resolveProfile($request);
        $ownedIds = $profile->semesters()->pluck('id')->map(static fn ($id) => (int) $id)->all();

        DB::transaction(function () use ($validated, $ownedIds, $profile): void {
            $order = 0;
            foreach ($validated['ids'] as $id) {
                $intId = (int) $id;
                if (in_array($intId, $ownedIds, true)) {
                    $profile->semesters()->where('id', $intId)->update(['sort_order' => $order++]);
                }
            }
        });

        return response()->json(['ok' => true]);
    }

    public function duplicate(Request $request, Semester $semester, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        if ((int) $semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $semester->load('courses');

        $copy = DB::transaction(function () use ($profile, $semester): Semester {
            $targetOrder = (int) $semester->sort_order + 1;
            $profile->semesters()
                ->where('sort_order', '>=', $targetOrder)
                ->increment('sort_order');

            $newSem = $profile->semesters()->create([
                'name' => substr($semester->name . ' (Salinan)', 0, 120),
                'period' => $semester->period,
                'sort_order' => $targetOrder,
                'collapsed' => false,
            ]);

            foreach ($semester->courses as $idx => $course) {
                $newSem->courses()->create([
                    'code' => $course->code,
                    'name' => $course->name,
                    'sks' => $course->sks,
                    'numeric_score' => $course->numeric_score,
                    'grade' => $course->grade,
                    'included' => $course->included,
                    'sort_order' => $idx,
                ]);
            }

            return $newSem->load('courses');
        });

        return response()->json(['semester' => $this->formatSemester($copy)], 201);
    }

    public function destroy(Request $request, Semester $semester, WorkspaceManager $workspace): JsonResponse
    {
        $profile = $workspace->resolveProfile($request);
        if ((int) $semester->academic_profile_id !== (int) $profile->id) {
            abort(403, 'Akses ditolak.');
        }

        $semester->delete();

        return response()->json(['ok' => true]);
    }

    public function restore(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'period' => ['nullable', 'string', 'max:120'],
            'collapsed' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            'courses' => ['sometimes', 'array'],
            'courses.*.code' => ['nullable', 'string', 'max:32'],
            'courses.*.name' => ['nullable', 'string', 'max:200'],
            'courses.*.sks' => ['nullable', 'numeric', 'min:0', 'max:24'],
            'courses.*.numericScore' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'courses.*.grade' => ['nullable', 'string', 'max:16'],
            'courses.*.included' => ['sometimes', 'boolean'],
        ]);

        $profile = $workspace->resolveProfile($request);

        $restored = DB::transaction(function () use ($profile, $validated): Semester {
            $order = (int) ($validated['sortOrder'] ?? ($profile->semesters()->max('sort_order') + 1));
            $profile->semesters()->where('sort_order', '>=', $order)->increment('sort_order');

            $sem = $profile->semesters()->create([
                'name' => $validated['name'],
                'period' => (string) ($validated['period'] ?? ''),
                'sort_order' => $order,
                'collapsed' => (bool) ($validated['collapsed'] ?? false),
            ]);

            foreach ($validated['courses'] ?? [] as $idx => $c) {
                $sem->courses()->create([
                    'code' => (string) ($c['code'] ?? ''),
                    'name' => (string) ($c['name'] ?? ''),
                    'sks' => (float) ($c['sks'] ?? 3),
                    'numeric_score' => $c['numericScore'] ?? null,
                    'grade' => (string) ($c['grade'] ?? ''),
                    'included' => ($c['included'] ?? true) !== false,
                    'sort_order' => $idx,
                ]);
            }

            return $sem->load('courses');
        });

        return response()->json(['semester' => $this->formatSemester($restored)], 201);
    }

    private function formatSemester(Semester $sem): array
    {
        return [
            'id' => (string) $sem->id,
            'name' => $sem->name,
            'period' => $sem->period ?? '',
            'collapsed' => (bool) $sem->collapsed,
            'courses' => $sem->courses->map(static function ($c): array {
                return [
                    'id' => (string) $c->id,
                    'code' => $c->code,
                    'name' => $c->name,
                    'sks' => (float) $c->sks,
                    'grade' => $c->grade,
                    'numericScore' => $c->numeric_score !== null ? (float) $c->numeric_score : null,
                    'included' => (bool) $c->included,
                ];
            })->values()->all(),
        ];
    }
}

