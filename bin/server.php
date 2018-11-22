<?php
/**
 * @author Steve Rhoades <sedonami@gmail.com>
 */
require_once (__DIR__ .'/../vendor/autoload.php');

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use Sketchpad\ExHttp\Server as ConnectionHandler;
use Sketchpad\ExDraw\Server as DrawServer;
use Sketchpad\ExHttp\Router;
use Sketchpad\ExHttp\StaticFile;

$loop               = React\EventLoop\Factory::create();
$documentRoot       = realpath(__DIR__ .'/../public');
$drawServer         = new DrawServer();

// get html and replace the host
$clientBootstrap    = file_get_contents(__DIR__ . '/../public/index.html');

/*
    Configure router, the router allows for callbacks to be executed on a route match.  If no
    match is found then it will look to see if it can load a static file.
 */
$router = new Router(array(
    "/" => function($request, $response, $connection) use ($clientBootstrap) {
        $response->setBody($clientBootstrap);
        $connection->send($response);
        $connection->close();
    }
));

$fileHandler = new StaticFile($documentRoot, $loop);
$router->setFileHandler($fileHandler);

/*
    Websocket and HTTP Server Sockets
    Note: Requires HAProxy to be configured.
*/
$socketServer = new React\Socket\Server($loop);
$socketServer->listen('8080', '0.0.0.0');
$websocketServer = new IoServer(
    new HttpServer(
        new WsServer(
            $drawServer
        )
    ),
    $socketServer,
    $loop
);

$httpSocket = new React\Socket\Server($loop);
$httpSocket->listen('80', '0.0.0.0');
$httpServer = new IoServer(
    new HttpServer(
        new ConnectionHandler($router)
    ),
    $httpSocket,
    $loop
);

$loop->run();

