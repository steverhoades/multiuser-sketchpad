<?php
namespace Sketchpad\ExHttp;

use Guzzle\Http\Message\Response;
use React\Promise\Promise;

/**
 * This is a quick and dirty router that allows for defining callables
 * for a given requested path.
 *
 * Example:
 * /index.php => array(new IndexController(), 'indexAction')
 *
 * The action will be passed the request object as well as the response object.
 *
 * Your action may return a Promise or a Response object.  The return value of
 * the promise MUST BE a response object.
 */
class Router
{
	protected $routes;
	protected $fileHandler;

	public function __construct($routes = array())
	{
		$this->routes = $routes;
	}

	public function setFileHandler($handler)
	{
		$this->fileHandler = $handler;
	}

	public function getFileHandler()
	{
		return $this->fileHandler;
	}

	public function addRoute($name, callable $callback)
	{
		$this->routes[$name] = $callback;

		return $this;
	}

	public function match($path)
	{
		return isset($this->routes[$path]);
	}

	public function dispatch($request, $connection)
	{
		$response 	= new Response(200);
		$path 		= $request->getPath();

		if($this->match($path)) {
			echo "Found match for path: $path" . PHP_EOL;
			if(is_callable($this->routes[$path])) {
				call_user_func_array($this->routes[$path], array($request, $response, $connection));
			} else {
				throw new \Exception('Invalid route definition.');
			}
			return;
		}

		if(is_null($this->fileHandler)) {
			throw new \Exception('No file handler configured');
		}

        if(false === $this->fileHandler->canHandleRequest($request)) {
            $response->setStatus(404);
            $response->setBody('File not found');

            $connection->send($response);
            $connection->close();
            return;
        }

        $this->fileHandler->handleRequest($request, $response, $connection);
	}


}
