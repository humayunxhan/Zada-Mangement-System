<?php
// Credentials stay outside the web root, never inside the upload package.
$privateDir = dirname(__DIR__, 3) . '/spms-private';
$path = $privateDir . '/config.php';
if (!is_file($path)) {
    throw new RuntimeException('SPMS configuration unavailable');
}
$config = require $path;
if (!is_array($config) || empty($config['configured']) || strlen($config['jwt_secret'] ?? '') < 32) {
    throw new RuntimeException('SPMS configuration incomplete');
}
$config['private_dir'] = $privateDir;
return $config;
