<?php
namespace Sketchpad\ExHttp;

class SseMessage
{
	protected $id;

	protected $eventName;

	protected $message;

	protected $retry;

	public function __construct($id = null, $eventName = null, $retry = null)
	{
		$this->id 		 = $id;
		$this->eventName = $eventName;
		$this->retry 	 = $retry;
	}

	public function setMessage($message)
	{
		$this->message = (is_array($message)) ? json_encode($message) : $message;
	}

	public function __toString()
	{
		$message = '';

		$message .= (!is_null($this->id)) ? "id: {$this->id}\n" : '';
		$message .= (!is_null($this->eventName)) ? "event: {$this->eventName}\n" : '';
		$message .= (!is_null($this->retry)) ? "retry: {$this->retry}\n" : '';
		$message .= "data:" . trim($this->message) . "\n\n";

		return $message;
	}
}
