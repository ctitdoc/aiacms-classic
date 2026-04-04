<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

$path = requestPath();
if (str_starts_with($path, '/api/')) {
    handleApiRequest($path);
}

renderShell();

function handleApiRequest(string $path): never
{
    try {
        $method = requestMethod();

        if ($path === '/api/documents' && $method === 'GET') {
            $documents = cmsGet('/cms/list_dictionary_request_json');
            $normalized = array_map(
                static fn(array $doc): array => normalizeDocument($doc),
                array_values(array_filter($documents, 'is_array'))
            );
            jsonResponse(['documents' => $normalized]);
        }

        if ($path === '/api/create-document' && $method === 'POST') {
            $payload = readJsonBody();
            $fileName = trim((string)($payload['fileName'] ?? ''));
            if ($fileName === '') {
                throw new RuntimeException('Nom de document requis.');
            }

            saveMockRecordedDocument($fileName);

            jsonResponse([
                'document' => [
                    'id' => 'content/' . $fileName,
                    'lastModifiedIso' => nowIso(),
                    'kind' => 'generic',
                    'features' => ['VIEW', 'EDIT', 'XML'],
                    'actions' => [
                        'VIEW' => buildAbsoluteCmsUrl('/cms/get_dict_file_content_request?file=mock'),
                        'EDIT' => buildAbsoluteCmsUrl('/static/editor/xopus/xopus.html#/cms/edit_dict_file_request?file=mock'),
                        'XML' => buildAbsoluteCmsUrl('/cms/get_dict_file_xml_content_request?file=mock'),
                    ],
                ],
            ]);
        }

        if ($path === '/api/delete-document' && $method === 'POST') {
            $payload = readJsonBody();
            $id = trim((string)($payload['id'] ?? ''));
            if ($id === '') {
                throw new RuntimeException('Document id required.');
            }
            deleteMockRecordedDocument($id);
            jsonResponse(['ok' => true]);
        }

        if ($path === '/api/run-xquery' && $method === 'POST') {
            $payload = readJsonBody();
            $query = (string)($payload['query'] ?? '');
            $format = strtoupper((string)($payload['format'] ?? 'HTML')) === 'XML' ? 'XML' : 'HTML';
            $content = $format === 'HTML'
                ? '<document><h>Query results :</h><p>MOCK (no BaseX)</p><pre>' . htmlEscape($query) . '</pre></document>'
                : '<document><h>Query results :</h><p>MOCK</p><query>' . xmlEscape($query) . '</query></document>';

            jsonResponse(['format' => $format, 'content' => $content]);
        }

        if ($path === '/api/logs' && $method === 'GET') {
            jsonResponse([
                'xml' => '<document><h>Logs</h><p>MOCK logs from BaseX</p><p>' . xmlEscape(nowIso()) . '</p></document>',
            ]);
        }

        if ($path === '/api/restructure-text-cv' && $method === 'POST') {
            $payload = readJsonBody();
            $rawText = (string)($payload['rawText'] ?? '');
            $id = makeProcessId('dictionary_retroconversion_demo');
            $xml = '<document><h>Resume</h><p>MOCK generated from raw text</p><rawText>' . xmlEscape(substr($rawText, 0, 200)) . '</rawText></document>';
            $html = '<h1>Resume</h1><p>MOCK generated from raw text</p>';
            $title = 'Text has been restructured as XML document content/' . $id . '.xml';
            $links = mockLinks($id);
            saveMockProcessResult($id, 'restructure', $title, $links, $xml, $html);

            jsonResponse([
                'result' => [
                    'id' => $id,
                    'title' => $title,
                    'links' => $links,
                    'xml' => $xml,
                    'html' => $html,
                ],
            ]);
        }

        if ($path === '/api/generate-cv' && $method === 'POST') {
            $payload = readJsonBody();
            $textDocument = trim((string)($payload['text_document'] ?? ''));
            $prePromptFile = trim((string)($payload['prePromptFile'] ?? ''));
            if ($textDocument === '') {
                throw new RuntimeException('Offer text is required.');
            }

            $generated = cmsPostForm('/cms/get_resume_for_job_offer_request_json', [
                'text_document' => $textDocument,
                'prePromptFile' => $prePromptFile,
            ]);

            jsonResponse(['document' => normalizeDocument($generated)]);
        }

        if ($path === '/api/result' && $method === 'GET') {
            $id = trim((string)routeQuery('id', ''));
            if ($id === '') {
                throw new RuntimeException('Result id required.');
            }

            $result = loadMockProcessResult($id);
            if ($result === null) {
                jsonResponse(['error' => 'Result not found.'], 404);
            }

            jsonResponse(['result' => $result]);
        }

        jsonResponse(['error' => 'Not found.'], 404);
    } catch (Throwable $e) {
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}

function renderShell(): void
{
    $config = appConfig();
    $frontendConfig = [
        'appTitle' => $config['app_title'],
        'appVersion' => $config['app_version'],
        'appName' => $config['app_name'],
        'cmsBaseUrl' => $config['cms_base_url'],
    ];

    $activePath = requestPath();
    if ($activePath === '/') {
        $activePath = '/documents';
    }

    ?><!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlEscape($config['app_title']) ?></title>
    <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<div class="layout">
    <aside class="sidebar">
        <div class="brand"><?= htmlEscape($config['app_title']) ?></div>
        <nav class="nav">
            <a href="/documents" data-nav-link class="<?= $activePath === '/documents' ? 'active' : '' ?>">Home / List documents</a>
            <a href="/record-document" data-nav-link class="<?= $activePath === '/record-document' ? 'active' : '' ?>">Record document</a>
            <a href="/query" data-nav-link class="<?= $activePath === '/query' ? 'active' : '' ?>">Document query (XQuery)</a>
            <a href="/logs" data-nav-link class="<?= $activePath === '/logs' ? 'active' : '' ?>">Get logs</a>
            <div class="hint">AI</div>
            <a href="/restructure" data-nav-link class="<?= $activePath === '/restructure' ? 'active' : '' ?>">Restructure text CV</a>
            <a href="/generate-cv" data-nav-link class="<?= $activePath === '/generate-cv' ? 'active' : '' ?>">Generate CV for offer</a>
        </nav>
        <p class="muted sidebar-note">
            UI mock. Remplacer progressivement les mocks par appels des endpoint backend.
        </p>
    </aside>
    <main class="content" id="app-root"></main>
</div>
<script>
window.AIACMS_CLASSIC_CONFIG = <?= json_encode($frontendConfig, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
</script>
<script src="/assets/app.js"></script>
</body>
</html><?php
    exit;
}
