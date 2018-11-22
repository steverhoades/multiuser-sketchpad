# ReactPHP WebSocket Demo
This is a demonstration of a HTML5 WebSocket server written in PHP.  The demo was originally written for a talk on asynchronous programming with PHP.  Slide deck can be found [here](http://www.slideshare.net/SteveRhoades2/asynchronous-php-and-realtime-messaging).  The Demo is using the fantastic libraries from [ReactPHP](https://github.com/reactphp) and Ratchet.

## What does it do?
This demonstration allows for multiple collaborators to draw and chat simultaneously and see the fruits of their labor updated in real time!

## Install
After downloading the demo code you will need to run composer install from the root of the directory.

```bash
$ composer install
```

## Run the Demo via Docker
First you need to build the docker container
```bash
docker build -t websocket-demo .
```

Then run the docker container
```bash
docker run -ti -p 80:80 -p 8080:8080 websocket-demo
```

## Run the Demo
This sample is configured to run the web server on port 80 and the web socket server on port 8080.  You will want to make sure that these ports are available or open the server file located in bin/server.php and the ws connection url in public/index.html and change the port numbers accordingly.

Since the demo runs on port 80 for the web server we'll need to start it with sudo (feel free to change this to any port you wish).

```bash
$ sudo php bin/server.php > /dev/null 2>&1 &
```

Once running open [http://127.0.0.1:80](http://127.0.0.1:80) in multiple browser windows, ideally side by side.

## Code of Interest

### The Server Code
The example server code is located in bin/server.php.  It sets up the initial http and websocket server that will be utilized.

First things first, when using ReactPHP we need the Event Loop.
```php
$loop = React\EventLoop\Factory::create();
```
This code uses the event loop factory which will determine which event loop to use based on the extensions loaded on your system.  If it cannot find any it will fall back to using the system select loop.  Although inefficient it will be perfectly fine for this demo.

Next we create the HTTP Server to server the .html client and other static files such as CSS and Javascript.

```php
$httpSocket = new React\Socket\Server($loop);
$httpSocket->listen('80', '0.0.0.0');
$httpServer = new IoServer(
    new HttpServer(
        new ConnectionHandler($router)
    ),
    $httpSocket,
    $loop
);
```
Here we are using the react socket server to bind to port 80 on all interfaces and then creating the Ratchet IoServer which in turn takes the Ratchet HttpServer, HttpSocket and EventLoop objects.  The ConnectionHandler that is passed to the HttpServer is used to route the requests to their corresponding files.

Next we create the WebSocket server.
```php
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
```
Similiar to how we created the Http Server above we pass a socket server to the Ratchet IoServer and then a WebSocket to the HttpServer.  Inside the WebServer we also add the entry point to our application.  This handler will be called any time there is a WebSocket connection or message.

Lastly we run the event loop.
```php
$loop->run();
```
This is where the magic happens.  The loop will listen for any events on all socket connections and trigger the appropriate events.  These events have been abstracted into the HttpServer and WsServer so within your own application your just receiving messages via method calls.
