<?php

namespace Sketchpad\ExHttp;

use Ratchet\Http\HttpServerInterface;
use Guzzle\Http\Message\Response;
use Ratchet\ConnectionInterface;
use Guzzle\Http\Message\RequestInterface;
use React\Promise\Promise;
use React\Partial;
use Evenement\EventEmitter;

Class Server extends EventEmitter implements HttpServerInterface
{
    protected $router;

    public function __construct($router)
    {
        $this->router = $router;
    }

    public function onOpen(ConnectionInterface $conn, RequestInterface $request = null)
    {
        $this->emit('open', array($conn, $request));
        try {
            $this->router->dispatch($request, $conn);
        } catch (Exception $e) {
            $response = new Response(500);
            $response->setBody("Server error.");
            $conn->send($response);
            $conn->close();
        }
    }

    /**
     * Triggered when a client sends data through the socket
     * @param  \Ratchet\ConnectionInterface $from The socket/connection that sent the message to your application
     * @param  string                       $msg  The message received
     * @throws \Exception
     */
    function onMessage(ConnectionInterface $from, $msg)
    {

    }

    /**
     * This is called before or after a socket is closed (depends on how it's closed).  SendMessage to $conn will not result in an error if it has already been closed.
     * @param  ConnectionInterface $conn The socket/connection that is closing/closed
     * @throws \Exception
     */
    function onClose(ConnectionInterface $conn)
    {
        $this->emit('close', array($conn));
    }

    /**
     * If there is an error with one of the sockets, or somewhere in the application where an Exception is thrown,
     * the Exception is sent back down the stack, handled by the Server and bubbled back up the application through this method
     * @param  ConnectionInterface $conn
     * @param  \Exception          $e
     * @throws \Exception
     */
    function onError(ConnectionInterface $conn, \Exception $e)
    {

    }

}
