<?php

namespace App\Services;

use App\Models\AcademicProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WorkspaceManager
{
    public const WORKSPACE_COOKIE = 'ipkpro_workspace';

    public function resolveProfile(Request $request, ?string &$newGuestToken = null): AcademicProfile
    {
        /** @var User|null $user */
        $user = Auth::user();

        if ($user) {
            $profile = $user->academicProfile()->with('semesters.courses')->first();
            if ($profile) {
                return $profile;
            }

            $guestToken = $request->cookie(self::WORKSPACE_COOKIE);
            if (is_string($guestToken) && $guestToken !== '') {
                $guestProfile = AcademicProfile::where('workspace_token', $guestToken)
                    ->whereNull('user_id')
                    ->first();
                if ($guestProfile) {
                    $guestProfile->update([
                        'user_id' => $user->id,
                        'student_name' => $guestProfile->student_name !== '' ? $guestProfile->student_name : $user->name,
                    ]);
                    return $guestProfile->load('semesters.courses');
                }
            }

            return $this->createInitialProfile([
                'user_id' => $user->id,
                'student_name' => $user->name,
            ]);
        }

        $token = $request->cookie(self::WORKSPACE_COOKIE);
        if (is_string($token) && $token !== '') {
            $profile = AcademicProfile::where('workspace_token', $token)
                ->with('semesters.courses')
                ->first();
            if ($profile) {
                return $profile;
            }
        }

        $newGuestToken = Str::random(40);

        return $this->createInitialProfile([
            'workspace_token' => $newGuestToken,
        ]);
    }

    public function claimGuestWorkspace(User $user, ?string $guestToken): void
    {
        if (!$guestToken) {
            return;
        }

        $guestProfile = AcademicProfile::where('workspace_token', $guestToken)
            ->whereNull('user_id')
            ->with('semesters.courses')
            ->first();

        if (!$guestProfile) {
            return;
        }

        $userProfile = $user->academicProfile()->with('semesters.courses')->first();
        if (!$userProfile) {
            $guestProfile->update([
                'user_id' => $user->id,
                'student_name' => $guestProfile->student_name !== '' ? $guestProfile->student_name : $user->name,
            ]);
            return;
        }

        // Only absorb guest workspace if user profile has no named courses yet while guest does
        if (!$this->hasMeaningfulCourses($userProfile) && $this->hasMeaningfulCourses($guestProfile)) {
            DB::transaction(function () use ($userProfile, $guestProfile): void {
                $userProfile->semesters()->delete();
                $userProfile->update([
                    'student_name' => $guestProfile->student_name ?: $userProfile->student_name,
                    'nim' => $guestProfile->nim ?: $userProfile->nim,
                    'prodi' => $guestProfile->prodi ?: $userProfile->prodi,
                    'university' => $guestProfile->university ?: $userProfile->university,
                    'scale_id' => $guestProfile->scale_id,
                    'scale_name' => $guestProfile->scale_name,
                    'scale_grades_json' => $guestProfile->scale_grades_json,
                    'retake_policy' => $guestProfile->retake_policy,
                    'target_ipk' => $guestProfile->target_ipk,
                    'total_target_sks' => $guestProfile->total_target_sks,
                    'theme' => $guestProfile->theme,
                    'onboarding_dismissed' => $guestProfile->onboarding_dismissed,
                ]);
                foreach ($guestProfile->semesters as $sem) {
                    $newSem = $userProfile->semesters()->create([
                        'name' => $sem->name,
                        'period' => $sem->period,
                        'sort_order' => $sem->sort_order,
                        'collapsed' => $sem->collapsed,
                    ]);
                    foreach ($sem->courses as $c) {
                        $newSem->courses()->create([
                            'code' => $c->code,
                            'name' => $c->name,
                            'sks' => $c->sks,
                            'numeric_score' => $c->numeric_score,
                            'grade' => $c->grade,
                            'included' => $c->included,
                            'sort_order' => $c->sort_order,
                        ]);
                    }
                }
                $guestProfile->delete();
            });
        }
    }

    private function hasMeaningfulCourses(AcademicProfile $profile): bool
    {
        foreach ($profile->semesters as $sem) {
            foreach ($sem->courses as $c) {
                if (trim((string) $c->name) !== '' || trim((string) $c->grade) !== '') {
                    return true;
                }
            }
        }
        return false;
    }

    public function createInitialProfile(array $attributes = []): AcademicProfile
    {
        $defaultScale = GradeScaleCatalog::defaultScale();

        return DB::transaction(function () use ($attributes, $defaultScale): AcademicProfile {
            $profile = AcademicProfile::create(array_merge([
                'student_name' => '',
                'nim' => '',
                'prodi' => '',
                'university' => '',
                'scale_id' => $defaultScale['id'],
                'scale_name' => $defaultScale['name'],
                'scale_grades_json' => $defaultScale['grades'],
                'retake_policy' => 'all',
                'target_ipk' => 3.50,
                'total_target_sks' => 144,
                'theme' => 'light',
                'onboarding_dismissed' => false,
            ], $attributes));

            $sem = $profile->semesters()->create([
                'name' => 'Semester 1',
                'period' => 'Ganjil',
                'sort_order' => 0,
                'collapsed' => false,
            ]);

            $sem->courses()->create([
                'code' => '',
                'name' => '',
                'sks' => 3,
                'numeric_score' => null,
                'grade' => '',
                'included' => true,
                'sort_order' => 0,
            ]);

            return $profile->load('semesters.courses');
        });
    }

    public function resetToBlank(AcademicProfile $profile): AcademicProfile
    {
        $defaultScale = GradeScaleCatalog::defaultScale();

        DB::transaction(function () use ($profile, $defaultScale): void {
            $profile->semesters()->delete();
            $profile->update([
                'scale_id' => $defaultScale['id'],
                'scale_name' => $defaultScale['name'],
                'scale_grades_json' => $defaultScale['grades'],
                'retake_policy' => 'all',
                'target_ipk' => 3.50,
                'total_target_sks' => 144,
                'onboarding_dismissed' => false,
            ]);

            $sem = $profile->semesters()->create([
                'name' => 'Semester 1',
                'period' => 'Ganjil',
                'sort_order' => 0,
                'collapsed' => false,
            ]);

            $sem->courses()->create([
                'code' => '',
                'name' => '',
                'sks' => 3,
                'numeric_score' => null,
                'grade' => '',
                'included' => true,
                'sort_order' => 0,
            ]);
        });

        return $profile->fresh('semesters.courses');
    }

    public function seedDemoData(AcademicProfile $profile): AcademicProfile
    {
        $defaultScale = GradeScaleCatalog::defaultScale();
        $demoSemesters = [
            [
                'name' => 'Semester 1',
                'period' => 'Ganjil 2024/2025',
                'courses' => [
                    ['code' => 'IF101', 'name' => 'Algoritma & Pemrograman', 'sks' => 4, 'grade' => 'A', 'numeric_score' => 89],
                    ['code' => 'IF102', 'name' => 'Kalkulus I', 'sks' => 3, 'grade' => 'B+', 'numeric_score' => 77],
                    ['code' => 'IF103', 'name' => 'Matematika Diskrit', 'sks' => 3, 'grade' => 'C', 'numeric_score' => 58],
                    ['code' => 'IF104', 'name' => 'Pengantar Teknologi Informasi', 'sks' => 2, 'grade' => 'A', 'numeric_score' => 91],
                    ['code' => 'UN101', 'name' => 'Bahasa Indonesia Akademik', 'sks' => 2, 'grade' => 'A-', 'numeric_score' => 82],
                ],
            ],
            [
                'name' => 'Semester 2',
                'period' => 'Genap 2024/2025',
                'courses' => [
                    ['code' => 'IF201', 'name' => 'Struktur Data', 'sks' => 4, 'grade' => 'A-', 'numeric_score' => 83],
                    ['code' => 'IF202', 'name' => 'Aljabar Linear', 'sks' => 3, 'grade' => 'B', 'numeric_score' => 73],
                    ['code' => 'IF203', 'name' => 'Arsitektur Komputer', 'sks' => 3, 'grade' => 'B+', 'numeric_score' => 78],
                    ['code' => 'IF204', 'name' => 'Basis Data Dasar', 'sks' => 3, 'grade' => 'A', 'numeric_score' => 88],
                    ['code' => 'UN102', 'name' => 'Bahasa Inggris Profesi', 'sks' => 2, 'grade' => 'A', 'numeric_score' => 86],
                ],
            ],
            [
                'name' => 'Semester 3',
                'period' => 'Ganjil 2025/2026',
                'courses' => [
                    ['code' => 'IF301', 'name' => 'Pemrograman Berorientasi Objek', 'sks' => 4, 'grade' => 'A', 'numeric_score' => 90],
                    ['code' => 'IF302', 'name' => 'Sistem Operasi', 'sks' => 3, 'grade' => 'A-', 'numeric_score' => 81],
                    ['code' => 'IF303', 'name' => 'Jaringan Komputer', 'sks' => 3, 'grade' => 'B+', 'numeric_score' => 76],
                    ['code' => 'IF103', 'name' => 'Matematika Diskrit (Mengulang)', 'sks' => 3, 'grade' => 'A', 'numeric_score' => 87],
                    ['code' => 'IF304', 'name' => 'Statistika & Probabilitas', 'sks' => 3, 'grade' => 'B+', 'numeric_score' => 79],
                ],
            ],
            [
                'name' => 'Semester 4',
                'period' => 'Genap 2025/2026',
                'courses' => [
                    ['code' => 'IF401', 'name' => 'Rekayasa Perangkat Lunak', 'sks' => 3, 'grade' => 'A', 'numeric_score' => 88],
                    ['code' => 'IF402', 'name' => 'Pemrograman Web Lanjut', 'sks' => 3, 'grade' => 'A', 'numeric_score' => 92],
                    ['code' => 'IF403', 'name' => 'Kecerdasan Buatan', 'sks' => 3, 'grade' => 'A-', 'numeric_score' => 84],
                    ['code' => 'IF404', 'name' => 'Analisis & Desain Algoritma', 'sks' => 3, 'grade' => 'B+', 'numeric_score' => 78],
                ],
            ],
        ];

        DB::transaction(function () use ($profile, $defaultScale, $demoSemesters): void {
            $profile->semesters()->delete();
            $profile->update([
                'student_name' => $profile->student_name !== '' ? $profile->student_name : 'Alya Rahmadani',
                'nim' => $profile->nim !== '' ? $profile->nim : '24515020111042',
                'prodi' => $profile->prodi !== '' ? $profile->prodi : 'Teknik Informatika',
                'university' => $profile->university !== '' ? $profile->university : 'Universitas Nusantara',
                'scale_id' => $defaultScale['id'],
                'scale_name' => $defaultScale['name'],
                'scale_grades_json' => $defaultScale['grades'],
                'retake_policy' => 'best',
                'target_ipk' => 3.65,
                'total_target_sks' => 144,
                'onboarding_dismissed' => true,
            ]);

            foreach ($demoSemesters as $sIdx => $sData) {
                $sem = $profile->semesters()->create([
                    'name' => $sData['name'],
                    'period' => $sData['period'],
                    'sort_order' => $sIdx,
                    'collapsed' => false,
                ]);
                foreach ($sData['courses'] as $cIdx => $cData) {
                    $sem->courses()->create([
                        'code' => $cData['code'],
                        'name' => $cData['name'],
                        'sks' => $cData['sks'],
                        'numeric_score' => $cData['numeric_score'],
                        'grade' => $cData['grade'],
                        'included' => true,
                        'sort_order' => $cIdx,
                    ]);
                }
            }
        });

        return $profile->fresh('semesters.courses');
    }

    public function importPayload(AcademicProfile $profile, array $data): AcademicProfile
    {
        $scaleData = $data['scale'] ?? [];
        $grades = GradeScaleCatalog::sanitizeGrades($scaleData['grades'] ?? []);
        if (count($grades) < 2) {
            $default = GradeScaleCatalog::defaultScale();
            $scaleId = $default['id'];
            $scaleName = $default['name'];
            $grades = $default['grades'];
        } else {
            $scaleId = substr((string) ($scaleData['id'] ?? 'custom'), 0, 40);
            $scaleName = substr((string) ($scaleData['name'] ?? 'Skala Impor'), 0, 100);
        }

        $retakePolicy = in_array($data['retakePolicy'] ?? 'all', ['all', 'best', 'latest'], true)
            ? $data['retakePolicy']
            : 'all';

        $pInfo = $data['profile'] ?? [];
        $planner = $data['planner'] ?? [];

        DB::transaction(function () use ($profile, $data, $scaleId, $scaleName, $grades, $retakePolicy, $pInfo, $planner): void {
            $profile->semesters()->delete();
            $profile->update([
                'student_name' => substr((string) ($pInfo['name'] ?? ''), 0, 150),
                'nim' => substr((string) ($pInfo['nim'] ?? ''), 0, 64),
                'prodi' => substr((string) ($pInfo['prodi'] ?? ''), 0, 150),
                'university' => substr((string) ($pInfo['university'] ?? ''), 0, 150),
                'scale_id' => $scaleId,
                'scale_name' => $scaleName,
                'scale_grades_json' => $grades,
                'retake_policy' => $retakePolicy,
                'target_ipk' => max(0.0, min(4.0, (float) ($planner['targetIpk'] ?? 3.5))),
                'total_target_sks' => max(1, min(300, (int) ($planner['totalTargetSks'] ?? 144))),
                'onboarding_dismissed' => true,
            ]);

            foreach ($data['semesters'] ?? [] as $sIdx => $sData) {
                $sem = $profile->semesters()->create([
                    'name' => substr((string) ($sData['name'] ?? ('Semester ' . ($sIdx + 1))), 0, 120),
                    'period' => substr((string) ($sData['period'] ?? ''), 0, 120),
                    'sort_order' => $sIdx,
                    'collapsed' => (bool) ($sData['collapsed'] ?? false),
                ]);
                foreach ($sData['courses'] ?? [] as $cIdx => $cData) {
                    $numScore = $cData['numericScore'] ?? ($cData['numeric_score'] ?? null);
                    $sem->courses()->create([
                        'code' => substr((string) ($cData['code'] ?? ''), 0, 32),
                        'name' => substr((string) ($cData['name'] ?? ''), 0, 200),
                        'sks' => max(0.0, min(24.0, (float) ($cData['sks'] ?? 3))),
                        'numeric_score' => ($numScore !== null && $numScore !== '') ? max(0.0, min(100.0, (float) $numScore)) : null,
                        'grade' => substr((string) ($cData['grade'] ?? ''), 0, 16),
                        'included' => ($cData['included'] ?? true) !== false,
                        'sort_order' => $cIdx,
                    ]);
                }
            }
        });

        return $profile->fresh('semesters.courses');
    }

    public function serialize(AcademicProfile $profile): array
    {
        $profile->loadMissing('semesters.courses');

        $grades = is_array($profile->scale_grades_json) && count($profile->scale_grades_json) >= 2
            ? $profile->scale_grades_json
            : GradeScaleCatalog::defaultScale()['grades'];

        $semesters = $profile->semesters->map(static function ($sem): array {
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
        })->values()->all();

        $user = Auth::user();

        return [
            'version' => 1,
            'theme' => $profile->theme === 'dark' ? 'dark' : 'light',
            'onboardingDismissed' => (bool) $profile->onboarding_dismissed,
            'profile' => [
                'name' => $profile->student_name,
                'nim' => $profile->nim,
                'prodi' => $profile->prodi,
                'university' => $profile->university,
            ],
            'scale' => [
                'id' => $profile->scale_id,
                'name' => $profile->scale_name,
                'description' => '',
                'grades' => $grades,
            ],
            'retakePolicy' => $profile->retake_policy,
            'planner' => [
                'targetIpk' => (float) $profile->target_ipk,
                'totalTargetSks' => (int) $profile->total_target_sks,
            ],
            'semesters' => $semesters,
            'auth' => [
                'authenticated' => $user !== null,
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                ] : null,
            ],
            'db' => [
                'connected' => true,
                'driver' => config('database.default'),
            ],
        ];
    }
}
