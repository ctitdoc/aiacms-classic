<?php
/*
 * ce script est obsolete: il serveit comme smoke test initial pour vérifier le bon setup des divers middelewae: Marai DB etc...
 * [TODO] script obsolete à supprimer du repo dans la prochaine itération
 */
declare(strict_types=1);

function envOrFail(string $name): string {
    $value = getenv($name);
    if ($value === false || $value === '') {
        throw new RuntimeException("Missing environment variable: {$name}");
    }
    return $value;
}

$dbHost = envOrFail('DB_HOST');
$dbPort = envOrFail('DB_PORT');
$dbName = envOrFail('DB_NAME');
$dbUser = envOrFail('DB_USER');
$dbPassword = envOrFail('DB_PASSWORD');

$error = null;
$pdoOk = false;

try {
    $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS healthcheck (
            id INT AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");

    $stmt = $pdo->query("SELECT COUNT(*) AS total FROM healthcheck");
    $row = $stmt->fetch();
    $total = (int)($row['total'] ?? 0);

    $pdoOk = true;
} catch (Throwable $e) {
    $error = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>AIACMS Classic</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 2rem;
            line-height: 1.5;
        }
        .ok { color: green; }
        .ko { color: darkred; }
        code {
            background: #f3f3f3;
            padding: 0.15rem 0.35rem;
        }
    </style>
</head>
<body>
    <h1>AIACMS Classic</h1>
    <p>Stack: <code>Apache + PHP + MariaDB + Docker Compose</code></p>

    <?php if ($pdoOk): ?>
        <p class="ok">Database connection: OK</p>
        <p>Rows currently in <code>healthcheck</code>: <?= htmlspecialchars((string)$total, ENT_QUOTES, 'UTF-8') ?></p>
    <?php else: ?>
        <p class="ko">Database connection: FAILED</p>
        <pre><?= htmlspecialchars((string)$error, ENT_QUOTES, 'UTF-8') ?></pre>
    <?php endif; ?>
</body>
</html>
