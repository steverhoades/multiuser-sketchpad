<?php

namespace Sketchpad\ExHttp;

use Guzzle\Http\Message\Response;
use React\Promise;
use React\Stream\Stream;
use React\Partial;

Class StaticFile
{
    protected $docroot;
    protected $loop;
    protected $buffer = [];
    protected $fileCache;

    public function __construct($docroot, $loop)
    {
        $this->docroot = $docroot;
        $this->loop = $loop;
    }

    public function getPath($request)
    {
        $path = $request->getPath();

        if ($path == "/") {
            $path = "index.html";
        }

        return $path;
    }

    public function canHandleRequest($request)
    {
        $path       = $this->getPath($request);
        $fullPath   = $this->docroot . DIRECTORY_SEPARATOR . $path;

        if (!file_exists($fullPath)) {
            return false;
        }

        return true;
    }

    public function handleRequest($request, $response, $connection)
    {

        $path     = $this->getPath($request);
        $fullPath = $this->docroot . DIRECTORY_SEPARATOR . $path;
        $fd       = fopen($fullPath, "r");

        /* @note LibEvent doesn't handle file reads asynchronously (non-blocking) */
        stream_set_blocking($fd, 0);
        $stream = new Stream($fd, $this->loop);

        $this->buffer[$path] = '';

        $stream->on('data',  Partial\bind([$this, 'onData'],  $path));
        $stream->on('close', Partial\bind([$this, 'onClose'], $path, $response, $connection));
        $stream->on('error', Partial\bind([$this, 'onError'], $path, $response, $connection));
    }

    public function send($connection, $response)
    {
        $connection->send($response);
        $connection->close();
    }

    public function onData($path, $data, $stream)
    {
        $this->buffer[$path] .= $data;
    }

    public function onClose($path, $response, $connection, $stream)
    {
        $this->fileCache[$path] = $this->buffer[$path];

        $response->setBody($this->buffer[$path]);
        $this->send($connection, $response);

        if (isset($this->buffer[$path])) {
            unset($this->buffer[$path]);
        }
    }

    public function onError($path, $response, $connection, $error, $stream)
    {
        $response->setStatus(500);
        $response->setBody("Internal server error");
        $this->send($connection, $response);
    }
}
