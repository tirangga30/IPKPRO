<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicProfile extends Model
{
    protected $fillable = [
        'user_id',
        'workspace_token',
        'student_name',
        'nim',
        'prodi',
        'university',
        'scale_id',
        'scale_name',
        'scale_grades_json',
        'retake_policy',
        'target_ipk',
        'total_target_sks',
        'theme',
        'onboarding_dismissed',
    ];

    protected function casts(): array
    {
        return [
            'scale_grades_json' => 'array',
            'target_ipk' => 'float',
            'total_target_sks' => 'integer',
            'onboarding_dismissed' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function semesters(): HasMany
    {
        return $this->hasMany(Semester::class)->orderBy('sort_order')->orderBy('id');
    }
}

