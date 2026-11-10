<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('academic_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->cascadeOnDelete();
            $table->string('workspace_token', 64)->nullable()->unique();
            $table->string('student_name', 150)->default('');
            $table->string('nim', 64)->default('');
            $table->string('prodi', 150)->default('');
            $table->string('university', 150)->default('');
            $table->string('scale_id', 40)->default('plus_minus');
            $table->string('scale_name', 100)->default('Standar Plus-Minus');
            $table->json('scale_grades_json')->nullable();
            $table->string('retake_policy', 20)->default('all');
            $table->decimal('target_ipk', 4, 2)->default(3.50);
            $table->unsignedSmallInteger('total_target_sks')->default(144);
            $table->string('theme', 10)->default('light');
            $table->boolean('onboarding_dismissed')->default(false);
            $table->timestamps();
        });

        Schema::create('semesters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_profile_id')->constrained('academic_profiles')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('period', 120)->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('collapsed')->default(false);
            $table->timestamps();

            $table->index(['academic_profile_id', 'sort_order']);
        });

        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('semester_id')->constrained('semesters')->cascadeOnDelete();
            $table->string('code', 32)->default('');
            $table->string('name', 200)->default('');
            $table->decimal('sks', 5, 2)->default(3.00);
            $table->decimal('numeric_score', 5, 2)->nullable();
            $table->string('grade', 16)->default('');
            $table->boolean('included')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['semester_id', 'sort_order']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('courses');
        Schema::dropIfExists('semesters');
        Schema::dropIfExists('academic_profiles');
    }
};

