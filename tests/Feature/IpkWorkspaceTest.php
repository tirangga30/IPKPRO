<?php

namespace Tests\Feature;

use App\Models\AcademicProfile;
use App\Models\User;
use App\Services\WorkspaceManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IpkWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_provisions_guest_workspace_and_renders_ipkpro(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('IPKPRO');
        $response->assertCookie(WorkspaceManager::WORKSPACE_COOKIE);
        $this->assertDatabaseCount('academic_profiles', 1);
        $this->assertDatabaseCount('semesters', 1);
        $this->assertDatabaseCount('courses', 1);
    }

    public function test_semester_and_course_crud_flow_persists_to_database(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $semRes = $this->postJson('/api/semesters', [
            'name' => 'Semester 2',
            'period' => 'Genap 2025',
            'withInitialCourse' => false,
        ]);
        $semRes->assertStatus(201)->assertJsonPath('semester.name', 'Semester 2');
        $semId = $semRes->json('semester.id');

        $courseRes = $this->postJson("/api/semesters/{$semId}/courses", [
            'code' => 'IF201',
            'name' => 'Struktur Data',
            'sks' => 4,
            'numericScore' => 90,
            'grade' => 'A',
        ]);
        $courseRes->assertStatus(201)->assertJsonPath('course.grade', 'A');
        $courseId = $courseRes->json('course.id');

        $this->patchJson("/api/courses/{$courseId}", [
            'grade' => 'A-',
            'sks' => 3,
        ])->assertStatus(200)->assertJsonPath('course.grade', 'A-');

        $this->postJson("/api/semesters/{$semId}/duplicate")
            ->assertStatus(201)
            ->assertJsonPath('semester.name', 'Semester 2 (Salinan)');

        $this->deleteJson("/api/courses/{$courseId}")->assertStatus(200);
        $this->deleteJson("/api/semesters/{$semId}")->assertStatus(200);

        $this->getJson('/api/health')->assertStatus(200)->assertJsonPath('ok', true);
    }

    public function test_demo_settings_import_and_reset_endpoints(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->postJson('/api/workspace/demo')
            ->assertStatus(200)
            ->assertJsonCount(4, 'semesters')
            ->assertJsonPath('retakePolicy', 'best');

        $this->patchJson('/api/workspace/settings', [
            'theme' => 'dark',
            'planner' => ['targetIpk' => 3.8, 'totalTargetSks' => 144],
            'profile' => ['name' => 'Tirangga', 'nim' => '12345', 'prodi' => 'Informatika', 'university' => 'UN'],
        ])->assertStatus(200)
            ->assertJsonPath('theme', 'dark')
            ->assertJsonPath('profile.name', 'Tirangga');

        $this->postJson('/api/workspace/reset')
            ->assertStatus(200)
            ->assertJsonCount(1, 'semesters');
    }

    public function test_user_cannot_modify_another_users_semester_or_course(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA);
        $semRes = $this->postJson('/api/semesters', ['name' => 'Rahasia A']);
        $semId = $semRes->json('semester.id');
        $courseId = $semRes->json('semester.courses.0.id');

        $this->actingAs($userB);
        $this->patchJson("/api/semesters/{$semId}", ['name' => 'Hack'])->assertStatus(403);
        $this->deleteJson("/api/courses/{$courseId}")->assertStatus(403);
    }

    public function test_guest_workspace_is_claimed_on_registration(): void
    {
        $guestToken = 'guest_token_demo_12345';
        $profile = AcademicProfile::create([
            'workspace_token' => $guestToken,
            'scale_id' => 'plus_minus',
            'scale_name' => 'Standar Plus-Minus',
            'retake_policy' => 'all',
            'target_ipk' => 3.5,
            'total_target_sks' => 144,
        ]);
        $sem = $profile->semesters()->create(['name' => 'Semester 1', 'period' => 'Ganjil', 'sort_order' => 0]);
        $sem->courses()->create(['code' => 'MK01', 'name' => 'Basis Data', 'sks' => 3, 'grade' => 'A']);

        $response = $this->withCookie(WorkspaceManager::WORKSPACE_COOKIE, $guestToken)
            ->post('/register', [
                'name' => 'Mahasiswa Baru',
                'email' => 'mhs@example.com',
                'password' => 'rahasia123',
                'password_confirmation' => 'rahasia123',
            ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();
        $user = User::where('email', 'mhs@example.com')->firstOrFail();
        $this->assertDatabaseHas('academic_profiles', [
            'id' => $profile->id,
            'user_id' => $user->id,
        ]);
    }
}

