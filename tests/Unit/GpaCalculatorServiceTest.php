<?php

namespace Tests\Unit;

use App\Services\GpaCalculatorService;
use App\Services\GradeScaleCatalog;
use PHPUnit\Framework\TestCase;

class GpaCalculatorServiceTest extends TestCase
{
    public function test_grade_scale_conversion(): void
    {
        $scale = GradeScaleCatalog::defaultScale()['grades'];

        $this->assertSame('A', GradeScaleCatalog::scoreToGrade($scale, 90)['letter']);
        $this->assertSame('A-', GradeScaleCatalog::scoreToGrade($scale, 84.5)['letter']);
        $this->assertSame('B+', GradeScaleCatalog::scoreToGrade($scale, 75)['letter']);
        $this->assertSame('C', GradeScaleCatalog::scoreToGrade($scale, 55)['letter']);
        $this->assertSame('E', GradeScaleCatalog::scoreToGrade($scale, 39.9)['letter']);
    }

    public function test_calculates_ips_ipk_and_retake_policies(): void
    {
        $calc = new GpaCalculatorService();
        $scale = GradeScaleCatalog::defaultScale();

        $semesters = [
            [
                'id' => 1,
                'name' => 'Semester 1',
                'courses' => [
                    ['id' => 1, 'code' => 'IF101', 'name' => 'Algoritma', 'sks' => 4, 'grade' => 'A', 'included' => true],
                    ['id' => 2, 'code' => 'IF103', 'name' => 'Matdis', 'sks' => 3, 'grade' => 'D', 'included' => true],
                ],
            ],
            [
                'id' => 2,
                'name' => 'Semester 2',
                'courses' => [
                    ['id' => 3, 'code' => 'IF201', 'name' => 'Strukdat', 'sks' => 4, 'grade' => 'B', 'included' => true],
                    ['id' => 4, 'code' => 'IF103', 'name' => 'Matdis (Mengulang)', 'sks' => 3, 'grade' => 'A', 'included' => true],
                ],
            ],
        ];

        $all = $calc->calculateSummary($semesters, $scale, 'all');
        $this->assertSame(14.0, $all['totalSks']);
        $this->assertEqualsWithDelta(43 / 14, $all['ipk'], 0.0001);
        $this->assertSame(1, $all['duplicateAcrossSemestersCount']);

        $best = $calc->calculateSummary($semesters, $scale, 'best');
        $this->assertSame(11.0, $best['totalSks']);
        $this->assertEqualsWithDelta(40 / 11, $best['ipk'], 0.0001);
        $this->assertEqualsWithDelta(19 / 7, $best['semesters'][0]['ips'], 0.0001);
        $this->assertEqualsWithDelta(24 / 7, $best['semesters'][1]['ips'], 0.0001);
    }
}
