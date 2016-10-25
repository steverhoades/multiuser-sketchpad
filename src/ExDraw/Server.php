<?php
namespace Sketchpad\ExDraw;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class Server implements MessageComponentInterface
{
    const USER_LIST = 0;
    const USER_ID = 1;
    const USER_CONNECTED = 2;
    const USER_DISCONNECTED = 3;
    const COMMAND = 4;
    const COMMAND_SETNICKNAME = 0;
    const COMMAND_POSITION = 1;
    const COMMAND_MOUSEDOWN = 2;
    const COMMAND_MESSAGE = 3;
    const DELIMITER = "|";

    protected $clients;
    protected $id = 0;
    protected $nicks = array();
    protected $drawing = array();
    protected $drawState = array();

    /**
     * Initialize $clients to SplObjectStorage.  This will be used to
     * store all connections.
     */
    public function __construct()
    {
        $this->clients = new \SplObjectStorage();
    }

    /**
     * Handle the new connection when it's received.
     *
     * @param  ConnectionInterface $conn
     * @return void
     */
    public function onOpen(ConnectionInterface $conn)
    {
        $this->id++;

        $_ = self::DELIMITER;

        // keep track of the connected client
        $this->clients->attach($conn, $this->id);

        // default nickname
        $this->nicks[$this->id] = "Guest {$this->id}";

        // initialize the drawing state for the user as false
        $this->drawing[$this->id] = false;

        // send user id
        $conn->send($this->id . $_ . self::USER_ID . $_ . $this->nicks[$this->id]);

        // broadcast all existing users.
        $userList = [];

        foreach ($this->nicks as $id => $nick) {
            if ($id != $this->id) {
                $userList[] = $id . $_ . $nick;
            }
        }

        // send the client the current list of users
        $conn->send($this->id . $_ . self::USER_LIST . $_ . join($_, $userList));

        // send drawing start event so that the client will begin drawing.
        $conn->send($this->id . $_ . self::COMMAND . $_ . self::COMMAND_MOUSEDOWN . $_ . '1');

        // send the captured drawing points so the client will initialize the current canvas state
        foreach ($this->drawState as $state) {
            $conn->send($this->id . $_ . $state);
        }

        // send drawing end event so that the client will stop drawing.
        $conn->send($this->id . $_ . self::COMMAND . $_ . self::COMMAND_MOUSEDOWN . $_ . '0');

        // broadcast new user
        $this->onMessage($conn, self::USER_CONNECTED . $_ . $this->id . $_ . $this->nicks[$this->id]);
    }

    /**
     * A new message was received from a connection.  Dispatch
     * that message to all other connected clients.
     *
     * @param  ConnectionInterface $from
     * @param  String              $msg
     * @return void
     */
    public function onMessage(ConnectionInterface $from, $msg)
    {
        $id     = $this->clients[$from];
        $data   = explode(self::DELIMITER, $msg);

        if (self::COMMAND === (int) $data[0]) {
            switch ($data[1]) {
                case self::COMMAND_SETNICKNAME:
                    $this->nicks[$id] = $data[2];
                    break;

                case self::COMMAND_MOUSEDOWN:
                    $this->drawing[$id] = 1 === (int)$data[2];
                    break;

                case self::COMMAND_POSITION:
                    if ($this->drawing[$id]) {
                        $this->drawState[] = $msg;
                    }
                    break;
            }
        }

        foreach ($this->clients as $client) {
           if ($from !== $client) {
                $client->send($id . self::DELIMITER . $msg);
            }
        }
    }

    /**
     * The connection has closed, remove it from the clients list.
     * @param  ConnectionInterface $conn
     * @return void
     */
    public function onClose(ConnectionInterface $conn)
    {
        $id = $this->clients[$conn];
        $this->onMessage($conn, self::USER_DISCONNECTED . self::DELIMITER . $id . self::DELIMITER . $this->nicks[$id]);
        $this->clients->detach($conn);

        // cleanup
        unset($this->nicks[$id]);
        unset($this->drawing[$this->id]);
    }

    /**
     * An error on the connection has occured, this is likely due to the connection
     * going away.  Close the connection.
     * @param  ConnectionInterface $conn
     * @param  Exception           $e
     * @return void
     */
    public function onError(ConnectionInterface $conn, \Exception $e)
    {
        $conn->close();
    }
}

