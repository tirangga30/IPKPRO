<?php

namespace App\Services;

class GradeScaleCatalog
{
    public static function presets(): array
    {
        return [
            [
                'id' => 'plus_minus',
                'name' => 'Standar Plus-Minus',
                'description' => 'Umum dipakai PTN & PTS (A, A-, B+, B, B-, C+, C, D, E)',
                'grades' => [
                    ['letter' => 'A', 'weight' => 4.0, 'minScore' => 85],
                    ['letter' => 'A-', 'weight' => 3.7, 'minScore' => 80],
                    ['letter' => 'B+', 'weight' => 3.3, 'minScore' => 75],
                    ['letter' => 'B', 'weight' => 3.0, 'minScore' => 70],
                    ['letter' => 'B-', 'weight' => 2.7, 'minScore' => 65],
                    ['letter' => 'C+', 'weight' => 2.3, 'minScore' => 60],
                    ['letter' => 'C', 'weight' => 2.0, 'minScore' => 55],
                    ['letter' => 'D', 'weight' => 1.0, 'minScore' => 40],
                    ['letter' => 'E', 'weight' => 0.0, 'minScore' => 0],
                ],
            ],
            [
                'id' => 'ab_bc',
                'name' => 'Skala AB / BC',
                'description' => 'Model ITB, ITS, Telkom & politeknik (A, AB, B, BC, C, D, E)',
                'grades' => [
                    ['letter' => 'A', 'weight' => 4.0, 'minScore' => 80],
                    ['letter' => 'AB', 'weight' => 3.5, 'minScore' => 73],
                    ['letter' => 'B', 'weight' => 3.0, 'minScore' => 65],
                    ['letter' => 'BC', 'weight' => 2.5, 'minScore' => 60],
                    ['letter' => 'C', 'weight' => 2.0, 'minScore' => 50],
                    ['letter' => 'D', 'weight' => 1.0, 'minScore' => 40],
                    ['letter' => 'E', 'weight' => 0.0, 'minScore' => 0],
                ],
            ],
            [
                'id' => 'quarter',
                'name' => 'Skala Kelipatan 0.25',
                'description' => 'A- bernilai 3.75 dan B+ bernilai 3.50 (A, A-, B+, B, ...)',
                'grades' => [
                    ['letter' => 'A', 'weight' => 4.0, 'minScore' => 85],
                    ['letter' => 'A-', 'weight' => 3.75, 'minScore' => 80],
                    ['letter' => 'B+', 'weight' => 3.5, 'minScore' => 75],
                    ['letter' => 'B', 'weight' => 3.0, 'minScore' => 70],
                    ['letter' => 'B-', 'weight' => 2.75, 'minScore' => 65],
                    ['letter' => 'C+', 'weight' => 2.5, 'minScore' => 60],
                    ['letter' => 'C', 'weight' => 2.0, 'minScore' => 55],
                    ['letter' => 'D', 'weight' => 1.0, 'minScore' => 40],
                    ['letter' => 'E', 'weight' => 0.0, 'minScore' => 0],
                ],
            ],
            [
                'id' => 'classic',
                'name' => 'Skala Klasik (5 Huruf)',
                'description' => 'Penilaian 5 huruf tanpa plus/minus (A, B, C, D, E)',
                'grades' => [
                    ['letter' => 'A', 'weight' => 4.0, 'minScore' => 80],
                    ['letter' => 'B', 'weight' => 3.0, 'minScore' => 70],
                    ['letter' => 'C', 'weight' => 2.0, 'minScore' => 56],
                    ['letter' => 'D', 'weight' => 1.0, 'minScore' => 40],
                    ['letter' => 'E', 'weight' => 0.0, 'minScore' => 0],
                ],
            ],
        ];
    }

    public static function defaultScale(): array
    {
        return self::presets()[0];
    }

    public static function getPreset(string $id): ?array
    {
        foreach (self::presets() as $preset) {
            if ($preset['id'] === $id) {
                return $preset;
            }
        }

        return null;
    }

    public static function sanitizeGrades(array $grades): array
    {
        $clean = [];
        foreach ($grades as $g) {
            if (!is_array($g)) {
                continue;
            }
            $letter = strtoupper(trim((string) ($g['letter'] ?? '')));
            if ($letter === '') {
                continue;
            }
            $clean[] = [
                'letter' => substr($letter, 0, 8),
                'weight' => max(0.0, min(4.0, (float) ($g['weight'] ?? 0))),
                'minScore' => max(0.0, min(100.0, (float) ($g['minScore'] ?? 0))),
            ];
        }

        usort($clean, static function (array $a, array $b): int {
            if ($b['weight'] !== $a['weight']) {
                return $b['weight'] <=> $a['weight'];
            }
            return $b['minScore'] <=> $a['minScore'];
        });

        return $clean;
    }

    public static function findGrade(array $grades, ?string $letter): ?array
    {
        $target = strtoupper(trim((string) $letter));
        if ($target === '') {
            return null;
        }
        foreach ($grades as $entry) {
            if (strtoupper(trim((string) ($entry['letter'] ?? ''))) === $target) {
                return $entry;
            }
        }
        return null;
    }

    public static function scoreToGrade(array $grades, float $score): ?array
    {
        $clamped = max(0.0, min(100.0, $score));
        $sorted = $grades;
        usort($sorted, static function (array $a, array $b): int {
            if ($b['minScore'] !== $a['minScore']) {
                return $b['minScore'] <=> $a['minScore'];
            }
            return $b['weight'] <=> $a['weight'];
        });

        foreach ($sorted as $entry) {
            if ($clamped >= (float) $entry['minScore']) {
                return $entry;
            }
        }

        return $sorted[count($sorted) - 1] ?? null;
    }
}
