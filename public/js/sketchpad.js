/**
 * The sketchpad manager class. It will manage messages coming from the server and interact with the various supporting
 * objects to handle drawing and chat.  In addition it will manage the state.
 *
 * @param connection        The websocket connection
 * @param canvas            The canvas dom element
 * @param messageInput      the chat input dom element
 * @param messageBox        the chat message dom element
 * @param options           object of options
 */
const USER_LIST = 0,
      USER_ID = 1,
      USER_CONNECTED = 2,
      USER_DISCONNECTED = 3,
      COMMAND = 4,
      COMMAND_SETNICKNAME = 0,
      COMMAND_POSITION = 1,
      COMMAND_DRAW = 2,
      COMMAND_MESSAGE = 3;


class Sketchpad {
    constructor(connection, canvas, messageInput, messageBox, options) {
        this.mouseX = 0;
        this.mouseY = 0;
        this.oldMouseX = 0;
        this.oldMouseY = 0;
        this.mouseDown = false;
        this.commands = [];
        this.lastMessage = '';
        this.currentUserId = null;
        this.currentColor = 0;
        this.colorJSON = '';

        this.settings = {
            delimiter: '|'
        };

        if (typeof options !== 'object') {
            options = {};
        }

        // merge settings
        for (varname in options) {
            if (this.settings[varname] !== undefined) {
                this.settings[varname] = options[varname];
            }
        }

        this.canvas = new SketchpadCanvas(canvas);
        this.userManager = new SketchPadUserManager(this.canvas.left());
        this.chatManager = new SketchPadChatManager(this.userManager, messageBox);

        this.connection = connection;
        this.connection.onclose = this.connectionClose.bind(this);
        this.connection.onmessage = this.connectionMessage.bind(this);

        this.messageInput = messageInput;

        // setup broadcast interval
        setInterval(this.broadcast.bind(this), 100);

        // add event listeners
        this.canvas.mousedown(this.onCanvasMouseDown.bind(this));

        document.addEventListener('mouseup', this.onDocumentMouseUp.bind(this), false);
        document.addEventListener('mousemove', this.onDocumentMouseMove.bind(this), false);

        this.messageInput.addEventListener('keypress', this.onInputBoxKeyPress.bind(this), false);
    }

    /**
     * Send the message string through the websocket connection
     * @param msg
     */
    send(msg) {
        this.connection.send(msg);
    }

    /**
     * Track mouse events and push them onto the commands stack.  Also we'll need to let the server know immediately that
     * the user is actively drawing.
     * @param event
     */
    onCanvasMouseDown( event ) {
        event.preventDefault();
        this.messageInput.blur();

        this.mouseDown = true;

        var scrollLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
        var scrollTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);

        this.mouseX = (event.clientX  + scrollLeft) - this.canvas.offsetLeft();
        this.mouseY = (event.clientY + scrollTop) - this.canvas.offsetTop();
    }

    /**
     * Set the drawing mode to false and let the server know immediately that drawing has ended
     * @param event
     */
    onDocumentMouseUp( event ) {
        this.mouseDown = false;
    }

    /**
     * Track the movement of the mouse and push onto the commands stack.  If the mouse is in draw mode than draw the
     * points onto the canvas.
     *
     * @param event
     */
    onDocumentMouseMove( event ) {
        this.oldMouseX = this.mouseX;
        this.oldMouseY = this.mouseY;

        var scrollLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
        var scrollTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);

        this.mouseX = (event.clientX  + scrollLeft) - this.canvas.offsetLeft();
        this.mouseY = (event.clientY + scrollTop) - this.canvas.offsetTop();

        if ( this.mouseDown ) {
            this.canvas.draw( this.oldMouseX, this.oldMouseY, this.mouseX, this.mouseY, this.currentColor );
            this.commands.push( COMMAND_DRAW, this.mouseX.toString( 16 ), this.mouseY.toString( 16 ), this.colorJSON );
            return;
        }

        // send position update
        this.commands.push( COMMAND_POSITION, this.mouseX.toString( 16 ), this.mouseY.toString( 16 ) );
    }

    /**
     * Send the aggregated commands to the server
     */
    broadcast() {
        if ( !this.commands.length || this.connection.readyState != 1 /*WebSocket.OPEN*/ ) {
            return;
        }

        this.send( COMMAND + this.settings.delimiter + this.commands.join(this.settings.delimiter) );
        this.commands = [];
    }

    /**
     * Convert hex color code to rgb
     *
     * @param hex
     * @returns {*}
     */
    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : 0;
    }

    /**
     * Set a color, should be rgb
     * @param value
     */
    setColor( value ) {
        this.currentColor   = this.hexToRgb(value);
        this.colorJSON      = JSON.stringify(this.currentColor);
    }

    /**
     * Save the drawing.  This will create a .png file
     */
    saveDrawing() {
        this.canvas.saveDrawing();
    }

    /**
     * Show a message in the event that the client gets discontinued.
     * @param event
     */
    connectionClose( event ) {
        this.chatManager.addServerMessage( 'Disconnected :/' );
    }

    /**
     * Parse any incoming messages.
     * @param event
     */
    connectionMessage( event ) {

        var dataArray = event.data.split( this.settings.delimiter );
        var dataLength = dataArray.length;
        var userId = dataArray[ 0 ];
        var position = 1;

        switch ( parseInt( dataArray[ position++ ] ) ) {

            case USER_ID:
                var name = dataArray[ position++ ];
                this.chatManager.setNickname(name);
                this.currentUserId = userId;
                break;

            case USER_LIST:
                while ( position < dataLength ) {
                    var id = dataArray[ position++ ];
                    if ( id ) {
                        this.userManager.addUser( id, id, dataArray[ position++ ] );
                    }
                }
                break;

            case USER_CONNECTED:
                this.userManager.addUser( userId, userId, dataArray[ 3 ] );
                this.chatManager.addMessage( userId, "Connected :)");
                break;

            case USER_DISCONNECTED:
                this.chatManager.addMessage( userId, "Disconnected :/");
                this.userManager.removeUser( userId );

                break;

            case COMMAND:
                var count = 0;

                if(this.userManager.users[ userId ] === undefined) {
                    this.userManager.addUser(userId, userId, userId.toString());
                }

                var user = this.userManager.users[ userId ];

                while ( position < dataLength ) {

                    if (count ++ > 10000 ) {
                        return;
                    }

                    switch ( parseInt( dataArray[ position++ ] ) ) {
                        case COMMAND_SETNICKNAME:
                            var newNickname = dataArray[ position++ ];
                            this.chatManager.addMessage( userId, "Is now known as "+ newNickname);
                            this.userManager.setUserNickname( userId,  newNickname);
                            break;

                        case COMMAND_POSITION:
                            var x = parseInt( dataArray[ position++ ], 16 );
                            var y = parseInt( dataArray[ position++ ], 16 );

                            user.position(x, y);

                            if (this.currentUserId != userId) {
                                user.move();
                            }
                            break;

                        case COMMAND_DRAW:
                            var x = parseInt( dataArray[ position++ ], 16 );
                            var y = parseInt( dataArray[ position++ ], 16 );
                            var colorVal = dataArray[ position++ ];
                            var color = (colorVal == 0 || colorVal == '') ? 0 : JSON.parse(colorVal);

                            if ( x != 0 && y != 0 ) {
                                this.canvas.draw( user.x, user.y, x, y, color );
                            }

                            user.position(x, y);

                            if (this.currentUserId != userId) {
                                user.move();
                            }
                            break;

                        case COMMAND_MESSAGE:
                            this.chatManager.addMessage( userId, dataArray[ position++ ] );
                            break;
                    }
                }

                break;
        }
    }

    /**
     * Did we get a chat message event?  if so, add the message and send it to the server.
     * @param event
     */
    onInputBoxKeyPress( event ) {
        switch( event.keyCode ) {
            case 13: // [ RETURN ]
                var value = this.messageInput.value;

                if ( value != "" && value != this.lastMessage ) {
                    this.lastMessage = value;
                    this.sendMessage( value );
                    this.chatManager.addLocalMessage( value );
                }

                this.messageInput.value = "";
                break;
        }
    }

    /**
     * Public API to change the current users nickname
     * @param nickname
     */
    setNickname( nickname ) {
        this.chatManager.setNickname(nickname);
        this.send( COMMAND + this.settings.delimiter + COMMAND_SETNICKNAME + this.settings.delimiter + nickname );
    }

    /**
     * Send a chat message to the server.
     * @param value
     */
    sendMessage( value ) {
        this.send( COMMAND + this.settings.delimiter + COMMAND_MESSAGE + this.settings.delimiter + value );
    }
}

/**
 * Encapsulates the logic for adding chat messages to the the message box
 */
class SketchPadChatManager {
    constructor(userManager, messageBox) {
        this.userManager = userManager;
        this.nickname;
        this.messageBox = messageBox;
        this.messagesArray = [];
    }

    setNickname(nickname) {
        this.nickname = nickname.slice( 0, 10 ).replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;').replace(/\ /gi,'&nbsp;');
        var nicknameSpan = document.getElementById( 'nickname' );
        nicknameSpan.innerHTML = this.nickname;
    }

    /**
     * "Server" messages are really messages that the client shows in the messages list to indicate application level
     * messages.
     * @param value
     */
    addServerMessage( value ) {
        var text = this.filter(value);

        var messageDiv = this.messageDiv();
        messageDiv.innerHTML = '<strong>' + text + '</strong>';

        this.addMessageToStack( messageDiv );
    }

    filter(text) {
        return text.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;');
    }

    /**
     * Add a message to the messages box
     * @param id
     * @param value
     */
    addMessage( id, value ) {
        var user = this.userManager.users[ id ];
        var text = this.filter(value);

        var messageDiv = this.messageDiv();
        messageDiv.style.color = 'rgb(' + user.idColor + ')';
        messageDiv.innerHTML = '<strong>' + user.nickname + ':</strong> ' + text;

        if ( user.level == 0 ) messageDiv.style.textDecoration = 'underline';

        this.addMessageToStack( messageDiv );
    }

    messageDiv() {
        var messageDiv = document.createElement( 'div' );
        messageDiv.style.width = '155px';
        messageDiv.style.marginBottom = '5px';
        messageDiv.style.overflow = 'hidden';

        return messageDiv;
    }

    /**
     * Add a message to this client that is from the current user.
     * @param value
     */
    addLocalMessage( value ) {
        var text = this.filter(value);

        var messageDiv = this.messageDiv();
        messageDiv.innerHTML = '<strong>' + nicknameSpan.innerHTML + ':</strong> ' + text;

        this.addMessageToStack( messageDiv );

        this.messageBox.appendChild( messageDiv );
    }

    /**
     * The messages stack.  After 40 messages start removing the first entries.
     * @param div
     */
    addMessageToStack( div ) {
        this.messagesArray.push( div );

        if ( this.messagesArray.length > 40 ) {
            this.messageBox.removeChild( this.messagesArray[ 0 ] );
            this.messagesArray.shift();
        }

        this.messageBox.appendChild( div );
        this.messageBox.scrollTop = this.messageBox.scrollHeight;
    }
}

/**
 * Encapsulates the logic for dealing with users, also sets up the cursor box (container)
 */
class SketchPadUserManager {
    constructor(leftPosition) {
        this.users = [];
        this.container = document.createElement('div');
        this.container.id = "container";

        // should have the same left value as the canvas
        this.container.style.left = leftPosition || 0;

        // ignore events on the cursor view
        this.container.addEventListener('mouseover', function (event) {
            event.preventDefault();
        }, false);
        this.container.addEventListener('mousedown', function (event) {
            event.preventDefault();
        }, false);

        // append to the document
        document.getElementsByTagName('body')[0].appendChild(this.container);
    }

    addUser(id, level, nickname) {
        this.users[id] = new SketchPadUser(id, level, nickname);
        this.container.appendChild( this.users[id].domElement );
    }

    removeUser(id) {
        if (this.users[id] && this.users[id].domElement) {
            this.container.removeChild(this.users[id].domElement);
            delete this.users[id];
        }
    }

    setUserNickname(id, nickname) {
        if (this.users[id]) {
            this.users[id].setNickname(nickname);
        }
    }
}

/**
 * User object properties as well as the cursor representation of the user
 * TODO separate the view and model logic
 */
class SketchPadUser {
    constructor(id, level, nickname) {
        this.id = id;
        this.idColor = Math.floor( Math.random() * 128 + 32 ) + ',' + Math.floor( Math.random() * 128 + 32 ) + ',' + Math.floor( Math.random() * 128 + 32 );
        this.x = 0;
        this.y = 0;
        this.level = parseInt( level );
        this.nickname = 'Guest';

        this.domElement = document.createElement( 'div' );
        this.nicknameElement = document.createElement( 'span' );

        var div = this.domElement;
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';

        var canvas = document.createElement( 'canvas' );
        canvas.width = 16;
        canvas.height = 16;

        div.appendChild( canvas );

        var context = canvas.getContext( '2d' );
        context.lineWidth = 0.2;
        context.fillStyle = 'rgba(' + this.idColor + ', 0.2)';
        context.strokeStyle = 'rgb(' + this.idColor + ')';

        context.beginPath();
        context.arc( 8, 8, 6, 0, Math.PI * 2, true );
        context.closePath();
        context.fill();
        context.stroke();

        var nicknameDiv = this.nicknameElement;
        nicknameDiv.style.position = 'absolute';
        nicknameDiv.style.top = '3px';
        nicknameDiv.style.left = '18px';
        nicknameDiv.style.color = 'rgb(' + this.idColor + ')';
        nicknameDiv.style.fontFamily = 'Helvetica, Arial';
        nicknameDiv.style.fontSize = '9px';

        this.setNickname(nickname);

        if ( this.level == 0 ) nicknameDiv.style.textDecoration = 'underline';
        div.appendChild( nicknameDiv );
    }

    position(x, y) {
        this.x = x;
        this.y = y;
    }

    move() {
        var element = this.domElement;
        element.style.left = ( this.x - 8 ) + 'px';
        element.style.top = ( this.y - 8 ) + 'px';
        element.style.visibility = 'visible';
    }

    setNickname(nickname) {
        this.nickname = (nickname == '' || nickname === undefined) ? id : nickname.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;').replace(/\ /gi,'&nbsp;');
        this.nicknameElement.innerHTML = this.nickname;
    }
}


/**
 * The follow object encapsulates the logic around the sketchpad drawing.
 * @param canvas
 */
class SketchpadCanvas {
    constructor(canvas) {
        this.canvas = canvas;

        // setup canvas context
        this.canvasContext = this.canvas.getContext('2d');
        this.canvasContext.lineWidth = 2.8;
        this.canvasContext.fillStyle = 'rgb(255, 255, 255)';
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Handle the drawing onto the canvas.
     * @param x1
     * @param y1
     * @param x2
     * @param y2
     * @param color
     */
    draw( x1, y1, x2, y2, color ) {
        var dx  = x2 - x1,
            dy = y2 - y1,
            d = Math.sqrt( dx * dx + dy * dy ) * 0.02;

        var context = this.canvasContext;
        context.strokeStyle = ( color == 0 ) ? 'rgba(0, 0, 0, ' + ( 0.7 - d )  + ')' : 'rgba('+ color.r +','+ color.g +','+ color.b +', ' + ( 1 - d )  + ')';
        context.beginPath();
        context.moveTo( x1, y1 );
        context.lineTo( x2, y2 );
        context.closePath();
        context.stroke();
    }

    /**
     * Save the canvas to a png
     */
    saveDrawing() {
        if ( window.sf_win ) window.sf_win.close();

        window.sf_win = window.open( 'about:blank', Math.random() * Math.random(), '' );
        window.sf_win.document.write( "<body style='background-color:#ddd;'><a onclick='update_img()' style='text-decoration:underline;cursor:pointer;color:#44f;'>Update Image</a></br><img id='p_img' width='800px' ><script>document.title='Saving Canvas';function update_img(){document.getElementById('p_img').src=opener.canvas.toDataURL( 'image/png' );};update_img();<\/script>" );
    }

    /**
     * Track down mousdown on the canvas element
     * @param callback
     */
    mousedown(callback) {
        this.canvas.addEventListener( 'mousedown', callback, false );
    }

    offsetLeft() {
        return this.canvas.offsetLeft;
    }

    offsetTop() {
        return this.canvas.offsetTop;
    }

    left() {
        return this.canvas.style.left;
    }
}
