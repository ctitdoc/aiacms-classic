<?php

declare(strict_types=1);

const ACTION_ORDER = [
    'VIEW', 'EDIT', 'XML',
    'MARKDOWN',
    'RESUME', 'RESUME/PDF',
    'PDF',
    'ARTURIA PAGE', 'SKATELECTRIQUE PAGE',
    'TEXTILE',
];

function appConfig(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = [
        'app_env' => envValue('APP_ENV', 'dev'),
        'app_version' => envValue('APP_VERSION', '0.4'),
        'app_name' => envValue('APP_NAME', 'aiacms-classic'),
        'app_title' => envValue('APP_TITLE', 'aiacms-classic v0.4'),
        'cms_base_url' => rtrim(envValue('CMS_BASE_URL', 'http://www.sitems.org:16386'), '/'),
        'db' => [
            'host' => envValue('DB_HOST', 'db'),
            'port' => envValue('DB_PORT', '3306'),
            'name' => envValue('DB_NAME', 'aiacms_classic'),
            'user' => envValue('DB_USER', 'aiacms'),
            'password' => envValue('DB_PASSWORD', 'aiacms'),
        ],
    ];

    return $config;
}

function envValue(string $name, ?string $default = null): string
{
    $value = getenv($name);
    if ($value === false || $value === '') {
        if ($default !== null) {
            return $default;
        }
        throw new RuntimeException("Missing environment variable: {$name}");
    }
    return (string)$value;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = appConfig()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $cfg['host'],
        $cfg['port'],
        $cfg['name']
    );

    $pdo = new PDO($dsn, $cfg['user'], $cfg['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    ensureSchema($pdo);

    return $pdo;
}

function ensureSchema(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS mock_recorded_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS mock_process_results (
            process_id VARCHAR(255) PRIMARY KEY,
            process_type VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            links_json LONGTEXT NOT NULL,
            xml_payload LONGTEXT NULL,
            html_payload LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    $done = true;
}

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function textResponse(string $payload, string $contentType = 'text/plain; charset=utf-8', int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: ' . $contentType);
    echo $payload;
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON payload.');
    }

    return $decoded;
}

function requestMethod(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function requestPath(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);
    return is_string($path) ? $path : '/';
}

function routeQuery(string $name, ?string $default = null): ?string
{
    $value = $_GET[$name] ?? $default;
    return is_string($value) ? $value : $default;
}

function buildAbsoluteCmsUrl(string $href): string
{
    if ($href === '') {
        return $href;
    }

    if (preg_match('#^https?://#i', $href) === 1) {
        return $href;
    }

    $baseUrl = appConfig()['cms_base_url'];
    if (str_starts_with($href, '/')) {
        return $baseUrl . $href;
    }

    return $baseUrl . '/' . ltrim($href, '/');
}

function normalizeDocument(array $doc): array
{
    $actions = [];
    foreach (($doc['actions'] ?? []) as $label => $href) {
        if (!is_string($label) || !is_string($href) || trim($href) === '') {
            continue;
        }
        $actions[$label] = buildAbsoluteCmsUrl($href);
    }

    return [
        'id' => (string)($doc['id'] ?? ''),
        'kind' => (string)($doc['kind'] ?? ''),
        'lastModifiedIso' => (string)($doc['lastModifiedIso'] ?? ''),
        'features' => array_values(array_map('strval', $doc['features'] ?? [])),
        'actions' => $actions,
    ];
}

function cmsGet(string $path): array
{
    $url = appConfig()['cms_base_url'] . $path;
    $response = httpRequest('GET', $url);
    $decoded = json_decode($response['body'], true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Unexpected CMS JSON response.');
    }
    return $decoded;
}

function cmsPostForm(string $path, array $fields): array
{
    $url = appConfig()['cms_base_url'] . $path;
    $response = httpRequest('POST', $url, [
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    $decoded = json_decode($response['body'], true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Unexpected CMS JSON response.');
    }

    return $decoded;
}

function httpRequest(string $method, string $url, array $curlOptions = []): array
{
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Unable to initialize HTTP client.');
    }

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ] + $curlOptions;

    curl_setopt_array($ch, $options);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

    if ($body === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('HTTP request failed: ' . $error);
    }

    curl_close($ch);

    if ($status >= 400) {
        throw new RuntimeException(sprintf('Remote request failed with status %d.', $status));
    }

    return ['status' => $status, 'body' => $body];
}

function xmlEscape(string $value): string
{
    return str_replace(
        ['&', '<', '>', '"', "'"],
        ['&amp;', '&lt;', '&gt;', '&quot;', '&apos;'],
        $value
    );
}

function htmlEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function nowIso(): string
{
    return date(DATE_ATOM);
}

function makeProcessId(string $prefix): string
{
    return $prefix . '_' . date('Ymd_His');
}

function mockLinks(string $id): array
{
    return [
        ['label' => 'EDIT', 'href' => '/mock/edit/' . rawurlencode($id)],
        ['label' => 'DELETE', 'href' => '/mock/delete/' . rawurlencode($id)],
        ['label' => 'RESUME', 'href' => '/mock/resume/' . rawurlencode($id)],
        ['label' => 'RESUME PDF', 'href' => '/mock/resume_pdf/' . rawurlencode($id)],
        ['label' => 'XML', 'href' => '/mock/xml/' . rawurlencode($id)],
    ];
}

function saveMockProcessResult(string $id, string $type, string $title, array $links, ?string $xml, ?string $html): void
{
    $stmt = db()->prepare(
        'REPLACE INTO mock_process_results (process_id, process_type, title, links_json, xml_payload, html_payload)
         VALUES (:process_id, :process_type, :title, :links_json, :xml_payload, :html_payload)'
    );

    $stmt->execute([
        ':process_id' => $id,
        ':process_type' => $type,
        ':title' => $title,
        ':links_json' => json_encode($links, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ':xml_payload' => $xml,
        ':html_payload' => $html,
    ]);
}

function loadMockProcessResult(string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM mock_process_results WHERE process_id = :process_id');
    $stmt->execute([':process_id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $links = json_decode((string)$row['links_json'], true);
    if (!is_array($links)) {
        $links = [];
    }

    return [
        'id' => (string)$row['process_id'],
        'title' => (string)$row['title'],
        'links' => $links,
        'xml' => $row['xml_payload'] !== null ? (string)$row['xml_payload'] : null,
        'html' => $row['html_payload'] !== null ? (string)$row['html_payload'] : null,
        'type' => (string)$row['process_type'],
    ];
}

function saveMockRecordedDocument(string $fileName): int
{
    $stmt = db()->prepare('INSERT INTO mock_recorded_documents (file_name) VALUES (:file_name)');
    $stmt->execute([':file_name' => $fileName]);
    return (int)db()->lastInsertId();
}

function deleteMockRecordedDocument(string $id): void
{
    $stmt = db()->prepare('DELETE FROM mock_recorded_documents WHERE file_name = :file_name');
    $stmt->execute([':file_name' => $id]);
}
