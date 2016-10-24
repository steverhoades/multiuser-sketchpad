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

        echo "Connecting {$this->id}" . PHP_EOL;

        $this->clients->attach($conn, $this->id);
        $this->nicks[$this->id] = "Guest {$this->id}";
        $this->drawing[$this->id] = false;

        // send user id
        $this->sendDataToConnection($conn, [$this->id, self::USER_ID, $this->nicks[$this->id]]);

        // broadcast all existing users.
        $userList = [];
        foreach($this->nicks as $id => $nick) {
            if($id != $this->id) {
                $userList[] = $id . self::DELIMITER . $nick;
            }
        }
        $this->sendDataToConnection($conn, [$this->id, self::USER_LIST, join(self::DELIMITER, $userList)]);

            // send current canvas state
        $this->sendDataToConnection($conn, [$this->id, '4', '2', '1']);
        foreach($this->drawState as $state) {
            $this->sendDataToConnection($conn, [$this->id, $state]);
        }
        $this->sendDataToConnection($conn, [$this->id, '4', '2', '0']);

        // broadcast new user
        $this->onMessage($conn, self::USER_CONNECTED . self::DELIMITER . $this->id . self::DELIMITER . $this->nicks[$this->id]);
    }

    private function sendDataToConnection($conn, $data)
    {
        $data = (is_array($data)) ? join(self::DELIMITER, $data) : $data;
        $conn->send($data);
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
        $id = $this->clients[$from];

        // check for nickname changes
        $data = explode(self::DELIMITER, $msg);
        if($data[0] == 4 && $data[1] == 0) {
            echo "storing nick {$data[2]}" .PHP_EOL;
            $this->nicks[$id] = $data[2];
        } elseif($data[0] == 4 && $data[1] == 2) {
            // drawing on connection started
            $this->drawing[$id] = $data[2] == 1;
        } else if($this->drawing[$id]) {
            $this->drawState[] = $msg;
        }

        foreach($this->clients as $client) {
           if($from !== $client) {
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
        unset($this->nicks[$id]);
        unset($this->drawing[$this->id]);
        $this->clients->detach($conn);
        echo "closing connection for $id" . PHP_EOL;
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

