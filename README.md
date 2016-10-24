# ReactPHP Websocket Demo
This demo was originally written as a demonstration for a talk on asynchronous programming with PHP.  Slide deck can be found [here](http://www.slideshare.net/SteveRhoades2/asynchronous-php-and-realtime-messaging).  The Demo using the fantastic libraries from [ReactPHP](https://github.com/reactphp) and Ratchet.

## Install
After downloading the demo code you will need to run composer install from the root of the directory.

```bash
$ composer install
```


## Run the Demo
This sample is configured to run the web server on port 81 and the web socket server on port 8080.  You will want to make sure that these ports are available or open the server file located in bin/server.php and change the port numbers accordingly.

Since the demo runs on port 81 for the web server we'll need to start it with sudo (feel free to change this to any port you wish).

```bash
$ sudo php bin/server.php > /dev/null 2>&1 &
```
Once running open your browser to: [http://127.0.0.1:81](http://127.0.0.1:81)

