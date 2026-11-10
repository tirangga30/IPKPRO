<?php

namespace App\Providers;

use App\Database\NeonPostgresConnector;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind('db.connector.pgsql', NeonPostgresConnector::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (
            $this->app->environment('production') ||
            isset($_SERVER['VERCEL']) ||
            isset($_ENV['VERCEL']) ||
            getenv('VERCEL')
        ) {
            URL::forceScheme('https');
        }
    }
}
