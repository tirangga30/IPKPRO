<?php

namespace App\Database;

use Illuminate\Database\Connectors\PostgresConnector;

class NeonPostgresConnector extends PostgresConnector
{
    /**
     * Ensure string ?options= query parameters from DATABASE_URL never crash PDO options parsing.
     */
    public function getOptions(array $config): array
    {
        if (isset($config['options']) && !is_array($config['options'])) {
            $config['options'] = [];
        }

        return parent::getOptions($config);
    }

    /**
     * Append Neon compute endpoint SNI fallback into DSN when connecting to *.neon.tech hosts.
     */
    protected function getDsn(array $config): string
    {
        $dsn = parent::getDsn($config);
        $host = (string) ($config['host'] ?? '');

        if (str_ends_with($host, '.neon.tech') && !str_contains($dsn, 'options=')) {
            $firstSegment = explode('.', $host)[0] ?? '';
            $endpoint = preg_replace('/-pooler$/', '', $firstSegment);

            if (is_string($endpoint) && $endpoint !== '') {
                $dsn .= ";options='endpoint={$endpoint}'";
            }
        }

        return $dsn;
    }
}

