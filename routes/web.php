<?php

use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\SemesterController;
use App\Http\Controllers\Api\WorkspaceController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\IpkController;
use Illuminate\Support\Facades\Route;

Route::get('/', [IpkController::class, 'index'])->name('home');

// Auth Pages
Route::middleware('guest')->group(function (): void {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->name('login.attempt');
    Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register'])->name('register.store');
});

Route::post('/logout', [AuthController::class, 'logout'])
    ->middleware('auth')
    ->name('logout');

// JSON API (Session + Cookie Workspace + CSRF protected)
Route::prefix('api')->group(function (): void {
    Route::get('/health', [WorkspaceController::class, 'health'])->name('api.health');

    Route::get('/workspace', [WorkspaceController::class, 'show'])->name('api.workspace.show');
    Route::patch('/workspace/settings', [WorkspaceController::class, 'updateSettings'])->name('api.workspace.settings');
    Route::post('/workspace/demo', [WorkspaceController::class, 'loadDemo'])->name('api.workspace.demo');
    Route::post('/workspace/import', [WorkspaceController::class, 'importData'])->name('api.workspace.import');
    Route::post('/workspace/reset', [WorkspaceController::class, 'reset'])->name('api.workspace.reset');

    Route::post('/semesters', [SemesterController::class, 'store'])->name('api.semesters.store');
    Route::post('/semesters/toggle-all', [SemesterController::class, 'toggleAll'])->name('api.semesters.toggle_all');
    Route::post('/semesters/reorder', [SemesterController::class, 'reorder'])->name('api.semesters.reorder');
    Route::post('/semesters/restore', [SemesterController::class, 'restore'])->name('api.semesters.restore');

    Route::patch('/semesters/{semester}', [SemesterController::class, 'update'])
        ->whereNumber('semester')
        ->name('api.semesters.update');
    Route::post('/semesters/{semester}/duplicate', [SemesterController::class, 'duplicate'])
        ->whereNumber('semester')
        ->name('api.semesters.duplicate');
    Route::delete('/semesters/{semester}', [SemesterController::class, 'destroy'])
        ->whereNumber('semester')
        ->name('api.semesters.destroy');

    Route::post('/semesters/{semester}/courses', [CourseController::class, 'store'])
        ->whereNumber('semester')
        ->name('api.courses.store');

    Route::patch('/courses/{course}', [CourseController::class, 'update'])
        ->whereNumber('course')
        ->name('api.courses.update');
    Route::delete('/courses/{course}', [CourseController::class, 'destroy'])
        ->whereNumber('course')
        ->name('api.courses.destroy');
});
