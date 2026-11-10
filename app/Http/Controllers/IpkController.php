<?php

namespace App\Http\Controllers;

use App\Services\GradeScaleCatalog;
use App\Services\WorkspaceManager;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class IpkController extends Controller
{
    public function index(Request $request, WorkspaceManager $workspace): Response
    {
        $newGuestToken = null;
        $dbConnected = true;

        try {
            $profile = $workspace->resolveProfile($request, $newGuestToken);
            $initialData = $workspace->serialize($profile);
        } catch (\Throwable $e) {
            report($e);
            $dbConnected = false;
            $user = Auth::user();
            $initialData = [
                'version' => 1,
                'theme' => 'light',
                'onboardingDismissed' => false,
                'profile' => ['name' => '', 'nim' => '', 'prodi' => '', 'university' => ''],
                'scale' => GradeScaleCatalog::defaultScale(),
                'retakePolicy' => 'all',
                'planner' => ['targetIpk' => 3.5, 'totalTargetSks' => 144],
                'semesters' => [
                    [
                        'id' => 'local_sem_1',
                        'name' => 'Semester 1',
                        'period' => 'Ganjil',
                        'collapsed' => false,
                        'courses' => [
                            [
                                'id' => 'local_mk_1',
                                'code' => '',
                                'name' => '',
                                'sks' => 3,
                                'grade' => '',
                                'numericScore' => null,
                                'included' => true,
                            ],
                        ],
                    ],
                ],
                'auth' => [
                    'authenticated' => $user !== null,
                    'user' => $user ? ['id' => $user->id, 'name' => $user->name, 'email' => $user->email] : null,
                ],
                'db' => [
                    'connected' => false,
                    'driver' => config('database.default'),
                ],
            ];
        }

        $response = response()->view('ipk.index', [
            'initialData' => $initialData,
            'dbConnected' => $dbConnected,
        ]);

        if ($newGuestToken !== null) {
            $response->withCookie(cookie(
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

        return $response;
    }
}

