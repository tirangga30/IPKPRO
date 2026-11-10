<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GpaCalculatorService;
use App\Services\GradeScaleCatalog;
use App\Services\WorkspaceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkspaceController extends Controller
{
    public function show(Request $request, WorkspaceManager $workspace, GpaCalculatorService $calc): JsonResponse
    {
        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);
        $data = $workspace->serialize($profile);
        $data['summary'] = $calc->calculateSummary(
            $data['semesters'],
            $data['scale'],
            $data['retakePolicy']
        );

        return $this->withGuestCookie(response()->json($data), $request, $newGuestToken);
    }

    public function updateSettings(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'theme' => ['sometimes', 'in:light,dark'],
            'onboardingDismissed' => ['sometimes', 'boolean'],
            'retakePolicy' => ['sometimes', 'in:all,best,latest'],
            'profile' => ['sometimes', 'array'],
            'profile.name' => ['nullable', 'string', 'max:150'],
            'profile.nim' => ['nullable', 'string', 'max:64'],
            'profile.prodi' => ['nullable', 'string', 'max:150'],
            'profile.university' => ['nullable', 'string', 'max:150'],
            'planner' => ['sometimes', 'array'],
            'planner.targetIpk' => ['sometimes', 'numeric', 'min:0', 'max:4'],
            'planner.totalTargetSks' => ['sometimes', 'integer', 'min:1', 'max:300'],
            'scale' => ['sometimes', 'array'],
            'scale.id' => ['required_with:scale', 'string', 'max:40'],
            'scale.name' => ['required_with:scale', 'string', 'max:100'],
            'scale.grades' => ['required_with:scale', 'array', 'min:2'],
            'scale.grades.*.letter' => ['required_with:scale', 'string', 'max:8'],
            'scale.grades.*.weight' => ['required_with:scale', 'numeric', 'min:0', 'max:4'],
            'scale.grades.*.minScore' => ['required_with:scale', 'numeric', 'min:0', 'max:100'],
        ]);

        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);

        $updates = [];
        if (array_key_exists('theme', $validated)) {
            $updates['theme'] = $validated['theme'];
        }
        if (array_key_exists('onboardingDismissed', $validated)) {
            $updates['onboarding_dismissed'] = $validated['onboardingDismissed'];
        }
        if (array_key_exists('retakePolicy', $validated)) {
            $updates['retake_policy'] = $validated['retakePolicy'];
        }
        if (isset($validated['profile'])) {
            $p = $validated['profile'];
            if (array_key_exists('name', $p)) {
                $updates['student_name'] = (string) ($p['name'] ?? '');
            }
            if (array_key_exists('nim', $p)) {
                $updates['nim'] = (string) ($p['nim'] ?? '');
            }
            if (array_key_exists('prodi', $p)) {
                $updates['prodi'] = (string) ($p['prodi'] ?? '');
            }
            if (array_key_exists('university', $p)) {
                $updates['university'] = (string) ($p['university'] ?? '');
            }
        }
        if (isset($validated['planner'])) {
            $pl = $validated['planner'];
            if (array_key_exists('targetIpk', $pl)) {
                $updates['target_ipk'] = (float) $pl['targetIpk'];
            }
            if (array_key_exists('totalTargetSks', $pl)) {
                $updates['total_target_sks'] = (int) $pl['totalTargetSks'];
            }
        }
        if (isset($validated['scale'])) {
            $grades = GradeScaleCatalog::sanitizeGrades($validated['scale']['grades']);
            if (count($grades) < 2) {
                return response()->json(['message' => 'Minimal harus ada 2 huruf nilai pada skala.'], 422);
            }
            $updates['scale_id'] = $validated['scale']['id'];
            $updates['scale_name'] = $validated['scale']['name'];
            $updates['scale_grades_json'] = $grades;
        }

        if (!empty($updates)) {
            $profile->update($updates);
        }

        return $this->withGuestCookie(
            response()->json($workspace->serialize($profile->fresh('semesters.courses'))),
            $request,
            $newGuestToken
        );
    }

    public function loadDemo(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);
        $updated = $workspace->seedDemoData($profile);

        return $this->withGuestCookie(
            response()->json($workspace->serialize($updated)),
            $request,
            $newGuestToken
        );
    }

    public function importData(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $validated = $request->validate([
            'semesters' => ['required', 'array'],
            'semesters.*.name' => ['nullable', 'string', 'max:120'],
            'semesters.*.period' => ['nullable', 'string', 'max:120'],
            'semesters.*.collapsed' => ['sometimes', 'boolean'],
            'semesters.*.courses' => ['sometimes', 'array'],
            'profile' => ['sometimes', 'array'],
            'scale' => ['sometimes', 'array'],
            'planner' => ['sometimes', 'array'],
            'retakePolicy' => ['sometimes', 'string'],
        ]);

        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);
        $updated = $workspace->importPayload($profile, $validated);

        return $this->withGuestCookie(
            response()->json($workspace->serialize($updated)),
            $request,
            $newGuestToken
        );
    }

    public function reset(Request $request, WorkspaceManager $workspace): JsonResponse
    {
        $newGuestToken = null;
        $profile = $workspace->resolveProfile($request, $newGuestToken);
        $updated = $workspace->resetToBlank($profile);

        return $this->withGuestCookie(
            response()->json($workspace->serialize($updated)),
            $request,
            $newGuestToken
        );
    }

    public function health(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
            return response()->json([
                'ok' => true,
                'driver' => config('database.default'),
                'database' => DB::connection()->getDatabaseName(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'driver' => config('database.default'),
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    private function withGuestCookie(JsonResponse $response, Request $request, ?string $token): JsonResponse
    {
        if ($token !== null) {
            $response->withCookie(cookie(
                WorkspaceManager::WORKSPACE_COOKIE,
                $token,
                60 * 24 * 365,
                '/',
                null,
                $request->isSecure(),
                true,
                false,
                'Lax'
            ));
        }

        return $response;
    }
}
