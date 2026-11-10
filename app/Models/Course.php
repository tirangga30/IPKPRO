<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Course extends Model
{
    protected $fillable = [
        'semester_id',
        'code',
        'name',
        'sks',
        'numeric_score',
        'grade',
        'included',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'sks' => 'float',
            'numeric_score' => 'float',
            'included' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function semester(): BelongsTo
    {
        return $this->belongsTo(Semester::class);
    }
}
