<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Semester extends Model
{
    protected $fillable = [
        'academic_profile_id',
        'name',
        'period',
        'sort_order',
        'collapsed',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'collapsed' => 'boolean',
        ];
    }

    public function academicProfile(): BelongsTo
    {
        return $this->belongsTo(AcademicProfile::class);
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class)->orderBy('sort_order')->orderBy('id');
    }
}

