<?php
namespace Sketchpad\ExDraw;

use Exception;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use SplObjectStorage as SplObjectStorageAlias;

class Server implements MessageComponentInterface
{
    const USER_LIST = 0;
    const USER_ID = 1;
    const USER_CONNECTED = 2;
    const USER_DISCONNECTED = 3;
    const COMMAND = 4;
    const COMMAND_SETNICKNAME = 0;
    const COMMAND_POSITION = 1;
    const COMMAND_DRAW = 2;
    const COMMAND_MESSAGE = 3;
    const DELIMITER = "|";

    /** @var SplObjectStorageAlias */
    protected $clients;

    /** @var int */
    protected $connectionSequenceId = 0;


    protected $nicks = array();
    protected $drawing = array();
    protected $drawState = array();

    /**
     * Initialize $clients to SplObjectStorage.  This will be used to
     * store all connections.
     */
    public function __construct()
    {
        $this->clients = new SplObjectStorageAlias();
    }

    /**
     * Handle the new connection when it's received.
     *
     * @param  ConnectionInterface $conn
     * @return void
     */
    public function onOpen(ConnectionInterface $conn)
    {
        $this->connectionSequenceId++;

        $_ = self::DELIMITER;

        // keep track of the connected client
        $this->clients->attach($conn, $this->connectionSequenceId);

        // default nickname
        $this->nicks[$this->connectionSequenceId] = "Guest {$this->connectionSequenceId}";

        // initialize the drawing state for the user as false
        $this->drawing[$this->connectionSequenceId] = false;

        // send user id
        $conn->send($this->connectionSequenceId . $_ . self::USER_ID . $_ . $this->nicks[$this->connectionSequenceId]);

        // broadcast all existing users.
        $userList = [];

        foreach ($this->nicks as $id => $nick) {
            if ($id != $this->connectionSequenceId) {
                $userList[] = $id . $_ . $nick;
            }
        }

        // send the client the current list of users
        $conn->send($this->connectionSequenceId . $_ . self::USER_LIST . $_ . join($_, $userList));

        // send the captured drawing points so the client will initialize the current canvas state
        foreach ($this->drawState as $state) {
            $conn->send($this->connectionSequenceId . $_ . $state);
        }

        // broadcast new user
        $this->onMessage($conn, self::USER_CONNECTED . $_ . $this->connectionSequenceId . $_ . $this->nicks[$this->connectionSequenceId]);
    }

    /**
     * A new message was received from a connection.  Dispatch
     * that message to all other connected clients.
     *
     * The message can be a list of commands.  We only want to store the draw state, the following will listen
     * for various messages that the server needs to keep track of.
     *
     * @param  ConnectionInterface $from
     * @param  String              $msg
     * @return void
     */
    public function onMessage(ConnectionInterface $from, $msg)
    {
        /** @var int $sequenceId */
        $sequenceId     = $this->clients[$from];
        $data   = explode(self::DELIMITER, $msg);
        $_      = self::DELIMITER;
        $drawState = null;

        if (self::COMMAND === (int) $data[0]) {
            $position = 1;
            $count = 0;
            $dataLength = count($data);

            while ( $position < $dataLength ) {

                if ($count++ > 10000 ) {
                    return;
                }

                switch ( $data[ $position++ ] ) {
                    case self::COMMAND_SETNICKNAME:
                        $this->nicks[$sequenceId] = $data[$position++];
                        break;

                    case self::COMMAND_POSITION:
                        //increment by 2
                        $position++;
                        $position++;
                        break;

                    case self::COMMAND_DRAW:
                        // positions: x, y, color
                        $drawState .= $_ . self::COMMAND_DRAW . $_ . $data[$position++] . $_ . $data[$position++] . $_ . $data[$position++];
                        break;

                    case self::COMMAND_MESSAGE:
                        $position++;
                        break;
                }
            }
        }

        if ($drawState) {
            $this->drawState[] = self::COMMAND . $drawState;
        }

        foreach ($this->clients as $client) {
            if ($from !== $client) {
                $client->send($sequenceId . $_ . $msg);
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
        /** @var int $sequenceId */
        $sequenceId = $this->clients[$conn];
        $this->onMessage($conn, self::USER_DISCONNECTED . self::DELIMITER . $sequenceId . self::DELIMITER . $this->nicks[$sequenceId]);
        $this->clients->detach($conn);

        // cleanup
        unset($this->nicks[$sequenceId]);
        unset($this->drawing[$this->connectionSequenceId]);
    }

    /**
     * An error on the connection has occured, this is likely due to the connection
     * going away.  Close the connection.
     * @param  ConnectionInterface $conn
     * @param  Exception           $e
     * @return void
     */
    public function onError(ConnectionInterface $conn, Exception $e)
    {
        $conn->close();
    }
}

