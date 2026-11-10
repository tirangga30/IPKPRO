<?php

namespace Tests\Unit;

use App\Database\NeonPostgresConnector;
use PHPUnit\Framework\TestCase;

class NeonPostgresConnectorTest extends TestCase
{
    public function test_injects_neon_endpoint_into_dsn_and_strips_pooler_suffix(): void
    {
        $connector = new class extends NeonPostgresConnector {
            public function exposeDsn(array $config): string
            {
                return $this->getDsn($config);
            }
        };

        $dsn = $connector->exposeDsn([
            'host' => 'ep-rough-dawn-bewh6r47-pooler.c-9.us-east-2.aws.neon.tech',
            'port' => '5432',
            'database' => 'neondb',
            'sslmode' => 'require',
        ]);

        $this->assertStringContainsString("options='endpoint=ep-rough-dawn-bewh6r47'", $dsn);
        $this->assertStringContainsString('sslmode=require', $dsn);
    }

    public function test_non_neon_host_does_not_receive_neon_endpoint_option(): void
    {
        $connector = new class extends NeonPostgresConnector {
            public function exposeDsn(array $config): string
            {
                return $this->getDsn($config);
            }
        };

        $dsn = $connector->exposeDsn([
            'host' => '127.0.0.1',
            'port' => '5432',
            'database' => 'app',
        ]);

        $this->assertStringNotContainsString('endpoint=', $dsn);
    }

    public function test_string_options_from_url_does_not_throw_type_error(): void
    {
        $connector = new NeonPostgresConnector();
        $opts = $connector->getOptions(['options' => 'endpoint=ep-test']);
        $this->assertIsArray($opts);
    }
}
