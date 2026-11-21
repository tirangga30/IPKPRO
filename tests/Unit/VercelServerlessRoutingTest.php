<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;

class VercelServerlessRoutingTest extends TestCase
{
    public function test_script_name_normalization_resolves_api_routes_correctly(): void
    {
        // Unnormalized (Vercel default where function is in /api/index.php)
        $_SERVER['REQUEST_URI'] = '/api/workspace';
        $_SERVER['SCRIPT_NAME'] = '/api/index.php';
        $_SERVER['SCRIPT_FILENAME'] = '/var/task/api/index.php';
        $unnormalized = Request::createFromGlobals();
        $this->assertSame('/api', $unnormalized->getBaseUrl());
        $this->assertSame('/workspace', $unnormalized->getPathInfo());

        // Normalized (Our fix in api/index.php)
        $_SERVER['REQUEST_URI'] = '/api/workspace';
        $_SERVER['SCRIPT_NAME'] = '/index.php';
        $_SERVER['PHP_SELF'] = '/index.php';
        $_SERVER['SCRIPT_FILENAME'] = '/var/task/public/index.php';
        $normalized = Request::createFromGlobals();
        $this->assertSame('', $normalized->getBaseUrl());
        $this->assertSame('/api/workspace', $normalized->getPathInfo());
    }
}
