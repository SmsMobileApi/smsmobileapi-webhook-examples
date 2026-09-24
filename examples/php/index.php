<?php

declare(strict_types=1);

const MAX_CLOCK_SKEW_SECONDS = 300;

function headerValue(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string) ($_SERVER[$key] ?? ''));
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$secret = (string) getenv('SMSMOBILEAPI_WEBHOOK_SECRET');
if ($secret === '') {
    respond(500, ['ok' => false, 'error' => 'webhook_secret_not_configured']);
}

$rawBody = (string) file_get_contents('php://input');
$timestamp = headerValue('X-SMSMobileAPI-Timestamp');
$signature = headerValue('X-SMSMobileAPI-Signature');

if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    respond(401, ['ok' => false, 'error' => 'invalid_or_stale_timestamp']);
}

$expected = 'v1=' . hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
if ($signature === '' || !hash_equals($expected, $signature)) {
    respond(401, ['ok' => false, 'error' => 'invalid_signature']);
}

try {
    $event = json_decode($rawBody, true, 64, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    respond(400, ['ok' => false, 'error' => 'invalid_json']);
}

if (!is_array($event) || empty($event['id']) || empty($event['type']) || !is_array($event['data'] ?? null)) {
    respond(400, ['ok' => false, 'error' => 'invalid_event_envelope']);
}

// Demo-only file store. In production, insert event.id into a database column
// with a UNIQUE constraint, enqueue the business job, then acknowledge quickly.
$storeDirectory = __DIR__ . '/../../var';
if (!is_dir($storeDirectory)) {
    mkdir($storeDirectory, 0700, true);
}
$eventFile = $storeDirectory . '/' . preg_replace('/[^a-zA-Z0-9-]/', '', (string) $event['id']) . '.json';
if (is_file($eventFile)) {
    respond(200, ['ok' => true, 'duplicate' => true]);
}
file_put_contents($eventFile, $rawBody, LOCK_EX);

respond(202, ['ok' => true, 'accepted' => true]);
