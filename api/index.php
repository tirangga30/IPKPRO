<?php

/**
 * Vercel Serverless Entry Point for Laravel.
 * Ensures writable directories exist inside /tmp before booting Laravel.
 */
$tmpStorage = '/tmp/storage';
$dirs = [
    $tmpStorage,
    $tmpStorage . '/app',
    $tmpStorage . '/framework',
    $tmpStorage . '/framework/cache',
    $tmpStorage . '/framework/cache/data',
    $tmpStorage . '/framework/sessions',
    $tmpStorage . '/framework/views',
    $tmpStorage . '/logs',
];

foreach ($dirs as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

$cacheOverrides = [
    'APP_CONFIG_CACHE' => '/tmp/config.php',
    'APP_EVENTS_CACHE' => '/tmp/events.php',
    'APP_PACKAGES_CACHE' => '/tmp/packages.php',
    'APP_ROUTES_CACHE' => '/tmp/routes.php',
    'APP_SERVICES_CACHE' => '/tmp/services.php',
    'VIEW_COMPILED_PATH' => '/tmp/storage/framework/views',
];

foreach ($cacheOverrides as $key => $value) {
    if (getenv($key) === false) {
        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

// Normalize SCRIPT_NAME, PHP_SELF, and REQUEST_URI so Laravel/Symfony handles routing from root
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';

if (isset($_SERVER['REQUEST_URI']) && str_starts_with($_SERVER['REQUEST_URI'], '/api/index.php')) {
    $_SERVER['REQUEST_URI'] = substr($_SERVER['REQUEST_URI'], strlen('/api/index.php')) ?: '/';
}

require __DIR__ . '/../public/index.php';

