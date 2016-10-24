/**
 * The sketchpad manager class. It will manaage messages coming from the server and interact with the various supporting
 * objects to handle drawing and chat.  In addition it will manage the state.
 *
 * @param connection        The websocket connection
 * @param canvas            The canvas dom element
 * @param messageInput      the chat input dom element
 * @param messageBox        the chat message dom element
 * @param options           object of options
 */
var sketchpad = function(connection, canvas, messageInput, messageBox, options) {
    this.USER_LIST =  0;
    this.USER_ID =  1;
    this.USER_CONNECTED =  2;
    this.USER_DISCONNECTED =  3;
    this.COMMAND =  4;
    this.COMMAND_SETNICKNAME =  0;
    this.COMMAND_POSITION =  1;
    this.COMMAND_MOUSEDOWN =  2;
    this.COMMAND_MESSAGE =  3;
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

    this.canvas = new sketchpadCanvas(canvas);

    this.connection = connection;
    this.connection.onclose = this.connectionClose.bind(this);
    this.connection.onmessage = this.connectionMessage.bind(this);

    this.messageInput = messageInput;
    this.messageBox = messageBox;

    // setup broadcast interval
    setInterval( this.broadcast.bind(this), 100 );

    // add event listeners
    this.canvas.mousedown(this.onCanvasMouseDown.bind(this));

    document.addEventListener( 'mouseup', this.onDocumentMouseUp.bind(this), false );
    document.addEventListener( 'mousemove', this.onDocumentMouseMove.bind(this), false );
    document.addEventListener( 'keydown', this.onDocumentKeyDown.bind(this), false );
    document.addEventListener( 'keyup', this.onDocumentKeyUp.bind(this), false );

    this.messageInput.addEventListener( 'keypress', this.onInputBoxKeyPress.bind(this), false );
};

//  define object properties and functions
sketchpad.prototype = {
    users: {},
    mouseX: 0,
    mouseY: 0,
    oldMouseX: 0,
    oldMouseY: 0,
    mouseDown: false,
    spaceKeyDown: false,
    panning: false,
    mouseXOnPan: 0,
    mouseYOnPan: 0,
    canvasXOnPan: 0,
    canvasYOnPan: 0,
    commands: [],
    messagesArray: [],
    lastMessage: '',
    currentUserId: null,
    currentColor: 0,
    colorJSON: '',

    send: function(msg) {
        this.connection.send(msg);
    },

    onCanvasMouseDown: function( event ) {
        event.preventDefault();
        // TODO attach to inupt box instance.
        this.messageInput.blur();

        if ( this.spaceKeyDown ) {
            this.panning = true;
            this.mouseXOnPan = event.clientX;
            this.mouseYOnPan = event.clientY;
            this.canvasXOnPan = this.canvas.offsetLeft();
            this.canvasYOnPan = this.canvas.offsetTop();

            return;
        }

        this.mouseDown = true;

        var scrollLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
        var scrollTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);

        this.mouseX = (event.clientX  + scrollLeft) - this.canvas.offsetLeft();
        this.mouseY = (event.clientY + scrollTop) - this.canvas.offsetTop();

        // send right away
        this.send("4"+ this.settings.delimiter + this.COMMAND_MOUSEDOWN + this.settings.delimiter +"1");
        this.commands.push( this.COMMAND_POSITION, this.mouseX.toString( 16 ), this.mouseY.toString( 16 ), this.colorJSON );
    },

    onDocumentMouseUp: function( event ) {
        this.panning = false;
        this.mouseDown = false;

        // send right away
        this.send("4" + this.settings.delimiter + this.COMMAND_MOUSEDOWN + this.settings.delimiter +"0");
    },

    onDocumentMouseMove: function( event ) {
        this.oldMouseX = this.mouseX;
        this.oldMouseY = this.mouseY;

        var scrollLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
        var scrollTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);

        this.mouseX = (event.clientX  + scrollLeft) - this.canvas.offsetLeft();
        this.mouseY = (event.clientY + scrollTop) - this.canvas.offsetTop();

        if ( this.mouseDown ) {
            this.canvas.draw( this.oldMouseX, this.oldMouseY, this.mouseX, this.mouseY, this.currentColor );
        }

        if ( !this.commands.length ) {
            this.commands.push( this.COMMAND_POSITION, this.mouseX.toString( 16 ), this.mouseY.toString( 16 ), this.colorJSON );
        } else if ( this.mouseDown ) {
            var deltaX = this.mouseX - this.oldMouseX;
            var deltaY = this.mouseY - this.oldMouseY;

            deltaX = deltaX == 0 ? "" : deltaX;
            deltaY = deltaY == 0 ? "" : deltaY;

            this.commands.push( this.COMMAND_POSITION, deltaX.toString( 16 ), deltaY.toString( 16 ), this.colorJSON );
        }
    },

    onDocumentKeyDown: function( event ) {
        switch( event.keyCode ) {
            case 32: // [ SPACE ]
                this.spaceKeyDown = true;
                break;
        }
    },

    onDocumentKeyUp: function( event ) {
        switch( event.keyCode ) {
            case 32: // [ SPACE ]
                this.spaceKeyDown = false;
                break;
        }
    },

    broadcast: function() {
        if ( !this.commands.length || this.connection.readyState != 1 /*WebSocket.OPEN*/ ) {
            return;
        }

        this.send( this.COMMAND + this.settings.delimiter + this.commands.join(this.settings.delimiter) );
        this.commands = [];
    },

    hexToRgb: function(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : 0;
    },

    setColor: function( value ) {
        this.currentColor   = this.hexToRgb(value);
        this.colorJSON      = JSON.stringify(this.currentColor);
    },

    saveDrawing: function() {
        this.canvas.saveDrawing();
    },

    connectionClose: function( event ) {
        this.addServerMessage( 'Disconnected :/' );
    },

    connectionMessage: function( event ) {

        var dataArray = event.data.split( this.settings.delimiter );
        var dataLength = dataArray.length;
        var userId = dataArray[ 0 ];
        var position = 1;

        switch ( parseInt( dataArray[ position++ ] ) ) {

            case this.USER_ID:
                var name = dataArray[ position++ ];
                var nicknameSpan = document.getElementById( 'nickname' );
                nicknameSpan.innerHTML = name;
                this.currentUserId = userId;
                break;

            case this.USER_LIST:
                while ( position < dataLength ) {
                    var id = dataArray[ position++ ];
                    if ( id ) {
                        this.addUser( id, id, dataArray[ position++ ] );
                    }
                }
                break;

            case this.USER_CONNECTED:
                this.addUser( userId, userId, dataArray[ 3 ] );
                this.addMessage( userId, "Connected :)");
                break;

            case this.USER_DISCONNECTED:
                this.addMessage( userId, "Disconnected :/");
                this.removeUser( userId );

                break;

            case this.COMMAND:

                var userMouseX = 0;
                var userMouseY = 0;
                var count = 0;

                if(this.users[ userId ] === undefined) {
                    this.addUser(userId, userId, userId.toString());
                }

                while ( position < dataLength ) {

                    if (count ++ > 10000 ) {
                        return;
                    }

                    switch ( parseInt( dataArray[ position++ ] ) ) {

                        case this.COMMAND_COLOR:
                            var colorVal = dataArray[ position++ ];
                            this.users[ userId ].color = (colorVal == 0) ? colorVal : JSON.parse(colorVal);
                            break;

                        case this.COMMAND_SETNICKNAME:
                            var newNickname = dataArray[ position++ ];
                            this.addMessage( userId, "Is now known as "+ newNickname);
                            this.setUserNickname( userId,  newNickname);

                            break;

                        case this.COMMAND_POSITION:

                            var x = parseInt( dataArray[ position++ ], 16 );
                            var y = parseInt( dataArray[ position++ ], 16 );
                            var colorVal = dataArray[ position++ ];
                            var color = (colorVal == 0 || colorVal == '') ? 0 : JSON.parse(colorVal);

                            userMouseX += x ? x : 0;
                            userMouseY += y ? y : 0;

                            this.canvas.moveUser(this.users[ userId ], userMouseX, userMouseY, color, this.currentUserId == userId);
                            break;

                        case this.COMMAND_MOUSEDOWN:
                            this.users[ userId ].mouseDown = dataArray[ position++ ] == '1';
                            break;

                        case this.COMMAND_MESSAGE:
                            this.addMessage( userId, dataArray[ position++ ] );
                            break;
                    }
                }

                break;
        }
    },

    onInputBoxKeyPress: function( event ) {
        // TODO attach inputbox instance
        switch( event.keyCode ) {
            case 13: // [ RETURN ]
                var value = this.messageInput.value;

                if ( value != "" && value != this.lastMessage ) {
                    this.lastMessage = value;
                    this.sendMessage( value );
                    this.addLocalMessage( value );
                }

                this.messageInput.value = "";
                break;
        }
    },

    addUser: function( id, level, nickname ) {
        var user = this.users[ id ] = {
            idColor: Math.floor( Math.random() * 128 + 32 ) + ',' + Math.floor( Math.random() * 128 + 32 ) + ',' + Math.floor( Math.random() * 128 + 32 ),
            x: 0,
            y: 0,
            level: parseInt( level ),
            nickname: (nickname == '' || nickname === undefined) ? id : nickname.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;').replace(/\ /gi,'&nbsp;'),
            color: 0,
            mouseDown: false
        };

        this.canvas.addUser(user);
    },

    setUserNickname: function( id, nickname ) {
        this.users[ id ].nickname = nickname.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;').replace(/\ /gi,'&nbsp;');
        this.users[ id ].nicknameElement.innerHTML = this.users[ id ].nickname;
    },

    removeUser: function( id ) {
        var user = this.users[ id ];

        if ( user ) {
            this.canvas.removeUser(user);
            delete user;
        }
    },

    changeNickname: function() {

        var nickname = prompt("Set your nickname. (Max 10 chars)");
        if(nickname) {
            nickname = nickname.slice( 0, 10 ).replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;').replace(/\ /gi,'&nbsp;');

            window.localStorage.nickname = nickname;

            this.setNickname( nickname );
        }
    },

    setNickname: function( nickname ) {
        nicknameSpan.innerHTML = nickname;
        this.send( this.COMMAND + this.settings.delimiter + this.COMMAND_SETNICKNAME + this.settings.delimiter + nickname );
    },

    addServerMessage: function( value ) {
        var text = value.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;');

        var messageDiv = document.createElement( 'div' );
        messageDiv.style.width = '155px';
        messageDiv.style.marginBottom = '5px';
        messageDiv.style.overflow = 'hidden';
        messageDiv.innerHTML = '<strong>' + text + '</strong>';

        this.addMessageToStack( messageDiv );
    },

    addMessage: function( id, value ) {
        var user = this.users[ id ];
        var text = value.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;');

        var messageDiv = document.createElement( 'div' );
        messageDiv.style.width = '155px';
        messageDiv.style.marginBottom = '5px';
        messageDiv.style.overflow = 'hidden';
        messageDiv.style.color = 'rgb(' + user.idColor + ')';
        messageDiv.innerHTML = '<strong>' + user.nickname + ':</strong> ' + text;
        if ( user.level == 0 ) messageDiv.style.textDecoration = 'underline';

        this.addMessageToStack( messageDiv );
    },

    addLocalMessage: function( value ) {
        var text = value.replace(/\</gi,'&lt;').replace(/\>/gi,'&gt;');

        var messageDiv = document.createElement( 'div' );
        messageDiv.style.width = '155px';
        messageDiv.style.marginBottom = '5px';
        messageDiv.style.overflow = 'hidden';
        messageDiv.innerHTML = '<strong>' + nicknameSpan.innerHTML + ':</strong> ' + text;

        this.addMessageToStack( messageDiv );

        this.messageBox.appendChild( messageDiv );
    },

    addMessageToStack: function( div ) {
        this.messagesArray.push( div );

        if ( this.messagesArray.length > 50 ) {
            this.messageBox.removeChild( this.messagesArray[ 0 ] );
            this.messagesArray.shift();
        }

        this.messageBox.appendChild( div );
        this.messageBox.scrollTop = this.messageBox.scrollHeight;
    },

    sendMessage: function( value ) {
        this.send( this.COMMAND + this.settings.delimiter + this.COMMAND_MESSAGE + this.settings.delimiter + value );
    }
};

/**
 * The follow object encapsulates the logic around the sketchpad drawing.
 * @param canvas
 */
var sketchpadCanvas = function(canvas) {
    this.canvas = canvas;

    this.container = document.createElement( 'div' );

    // should have the same left value as the canvas
    this.container.style.left = this.canvas.style.left;

    // ignore events on the cursor view
    this.container.addEventListener( 'mouseover', function( event ) { event.preventDefault(); }, false );
    this.container.addEventListener( 'mousedown', function( event ) { event.preventDefault(); }, false );

    // append to the document
    document.getElementsByTagName('body')[0].appendChild(this.container);


    // setup canvas context
    this.canvasContext = this.canvas.getContext( '2d' );
    this.canvasContext.lineWidth = 2.8;
    this.canvasContext.fillStyle = 'rgb(255, 255, 255)';
    this.canvasContext.fillRect( 0, 0, this.canvas.width, this.canvas.height);
};

sketchpadCanvas.prototype = {
    draw: function( x1, y1, x2, y2, color ) {
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
    },

    saveDrawing: function() {
        if ( window.sf_win ) window.sf_win.close();

        window.sf_win = window.open( 'about:blank', Math.random() * Math.random(), '' );
        window.sf_win.document.write( "<body style='background-color:#ddd;'><a onclick='update_img()' style='text-decoration:underline;cursor:pointer;color:#44f;'>Update Image</a></br><img id='p_img' width='800px' ><script>document.title='Saving Canvas';function update_img(){document.getElementById('p_img').src=opener.canvas.toDataURL( 'image/png' );};update_img();<\/script>" );
    },

    addUser: function(user) {
        var div = document.createElement( 'div' );
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        user.domElement = div;

        var canvas = document.createElement( 'canvas' );
        canvas.width = 16;
        canvas.height = 16;

        div.appendChild( canvas );

        var context = canvas.getContext( '2d' );
        context.lineWidth = 0.2;
        context.fillStyle = 'rgba(' + user.idColor + ', 0.2)';
        context.strokeStyle = 'rgb(' + user.idColor + ')';

        context.beginPath();
        context.arc( 8, 8, 6, 0, Math.PI * 2, true );
        context.closePath();
        context.fill();
        context.stroke();

        var nicknameDiv = document.createElement( 'span' );
        nicknameDiv.style.position = 'absolute';
        nicknameDiv.style.top = '3px';
        nicknameDiv.style.left = '18px';
        nicknameDiv.style.color = 'rgb(' + user.idColor + ')';
        nicknameDiv.style.fontFamily = 'Helvetica, Arial';
        nicknameDiv.style.fontSize = '9px';
        nicknameDiv.innerHTML = user.nickname;

        if ( user.level == 0 ) nicknameDiv.style.textDecoration = 'underline';
        div.appendChild( nicknameDiv );

        user.nicknameElement = nicknameDiv;

        container.appendChild( user.domElement );
    },

    moveUser: function(user, x, y, color, currentUser ) {
        if ( user.mouseDown && user.x != 0 && user.y != 0 ) {
            this.draw( user.x, user.y, x, y, color );
        }

        user.x = x;
        user.y = y;

        if (currentUser) {
            return;
        }

        var element = user.domElement;
        element.style.left = ( user.x - 8 ) + 'px';
        element.style.top = ( user.y - 8 ) + 'px';
        element.style.visibility = 'visible';
    },

    removeUser: function( user ) {
        if ( user && user.domElement) {
            container.removeChild( user.domElement );
        }
    },

    mousedown: function(callback) {
        this.canvas.addEventListener( 'mousedown', callback, false );
    },

    offsetLeft: function() {
        return this.canvas.offsetLeft;
    },

    offsetTop: function() {
        return this.canvas.offsetTop;
    }
};
