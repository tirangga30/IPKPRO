<?php

namespace App\Services;

class GpaCalculatorService
{
    public function getIdentityKey(array $course): ?string
    {
        $code = strtoupper((string) preg_replace('/\s+/', '', trim((string) ($course['code'] ?? ''))));
        if ($code !== '') {
            return 'code:' . $code;
        }
        $name = strtolower((string) preg_replace('/\s+/', ' ', trim((string) ($course['name'] ?? ''))));
        if ($name !== '') {
            return 'name:' . $name;
        }
        return null;
    }

    public function calculateSummary(array $semesters, array $scale, string $retakePolicy = 'all'): array
    {
        $grades = $scale['grades'] ?? GradeScaleCatalog::defaultScale()['grades'];
        $maxWeight = 0.0;
        foreach ($grades as $g) {
            if ((float) $g['weight'] > $maxWeight) {
                $maxWeight = (float) $g['weight'];
            }
        }
        if ($maxWeight <= 0) {
            $maxWeight = 4.0;
        }

        $flatCourses = [];
        $semesterResolved = [];
        $crossMap = [];

        foreach ($semesters as $sIdx => $sem) {
            $resolvedList = [];
            $courses = $sem['courses'] ?? [];
            foreach ($courses as $cIdx => $course) {
                $sks = (float) ($course['sks'] ?? 0);
                $validSks = is_finite($sks) && $sks > 0 ? $sks : 0.0;
                $rawGrade = trim((string) ($course['grade'] ?? ''));
                $gradeEntry = $rawGrade !== '' ? GradeScaleCatalog::findGrade($grades, $rawGrade) : null;
                $included = ($course['included'] ?? true) !== false;
                $calculable = $included && $validSks > 0 && $gradeEntry !== null;
                $weight = $gradeEntry ? (float) $gradeEntry['weight'] : 0.0;
                $mutu = $calculable ? $validSks * $weight : 0.0;
                $identityKey = $this->getIdentityKey($course);

                $row = [
                    'id' => $course['id'] ?? ($sIdx . '_' . $cIdx),
                    'semIndex' => $sIdx,
                    'courseIndex' => $cIdx,
                    'identityKey' => $identityKey,
                    'validSks' => $validSks,
                    'weight' => $weight,
                    'mutu' => $mutu,
                    'calculable' => $calculable,
                    'countedInIps' => $calculable,
                    'countedInIpk' => $calculable,
                    'supersededByIpk' => false,
                ];

                $flatCourses[] = &$row;
                $resolvedList[] = &$row;
                unset($row);

                if ($calculable && $identityKey !== null) {
                    $crossMap[$identityKey][$sIdx] = true;
                }
            }
            $semesterResolved[] = $resolvedList;
        }

        $duplicateAcrossSemestersCount = 0;
        foreach ($crossMap as $semSet) {
            if (count($semSet) > 1) {
                $duplicateAcrossSemestersCount++;
            }
        }

        if ($retakePolicy === 'best' || $retakePolicy === 'latest') {
            $groups = [];
            foreach ($flatCourses as $idx => $c) {
                if (!$c['calculable'] || $c['identityKey'] === null) {
                    continue;
                }
                $groups[$c['identityKey']][] = $idx;
            }

            foreach ($groups as $indices) {
                if (count($indices) <= 1) {
                    continue;
                }
                $winnerIdx = $indices[0];
                foreach ($indices as $candidateIdx) {
                    if ($candidateIdx === $winnerIdx) {
                        continue;
                    }
                    $cand = $flatCourses[$candidateIdx];
                    $win = $flatCourses[$winnerIdx];

                    if ($retakePolicy === 'best') {
                        $candWins = $cand['weight'] > $win['weight']
                            || ($cand['weight'] === $win['weight'] && (
                                $cand['semIndex'] > $win['semIndex']
                                || ($cand['semIndex'] === $win['semIndex'] && $cand['courseIndex'] > $win['courseIndex'])
                            ));
                    } else {
                        $candWins = $cand['semIndex'] > $win['semIndex']
                            || ($cand['semIndex'] === $win['semIndex'] && $cand['courseIndex'] > $win['courseIndex']);
                    }

                    if ($candWins) {
                        $winnerIdx = $candidateIdx;
                    }
                }

                foreach ($indices as $idx) {
                    if ($idx !== $winnerIdx) {
                        $flatCourses[$idx]['countedInIpk'] = false;
                        $flatCourses[$idx]['supersededByIpk'] = true;
                    }
                }
            }
        }

        $totalIpkSks = 0.0;
        $totalIpkMutu = 0.0;
        $totalIpkCourses = 0;
        $semesterSummaries = [];

        foreach ($semesters as $sIdx => $sem) {
            $semSks = 0.0;
            $semMutu = 0.0;
            foreach ($semesterResolved[$sIdx] as $item) {
                if ($item['countedInIps']) {
                    $semSks += $item['validSks'];
                    $semMutu += $item['mutu'];
                }
                if ($item['countedInIpk']) {
                    $totalIpkSks += $item['validSks'];
                    $totalIpkMutu += $item['mutu'];
                    $totalIpkCourses++;
                }
            }
            $semesterSummaries[] = [
                'id' => $sem['id'] ?? $sIdx,
                'name' => $sem['name'] ?? ('Semester ' . ($sIdx + 1)),
                'sks' => $semSks,
                'mutu' => $semMutu,
                'ips' => $semSks > 0 ? $semMutu / $semSks : null,
            ];
        }

        $ipk = $totalIpkSks > 0 ? $totalIpkMutu / $totalIpkSks : 0.0;

        return [
            'ipk' => round($ipk, 4),
            'totalSks' => $totalIpkSks,
            'totalMutu' => round($totalIpkMutu, 4),
            'totalCountedCourses' => $totalIpkCourses,
            'maxWeight' => $maxWeight,
            'semesters' => $semesterSummaries,
            'duplicateAcrossSemestersCount' => $duplicateAcrossSemestersCount,
        ];
    }
}
