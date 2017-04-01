var Render = function(message, force_raw) {
  if (force_raw) return raw(message);
  switch (String(message.Command)) {
  case "NICK":
    var old = message.Prefix.Name;
    var nick = message.Params[0];
    message.Prefix.Name = nick;
    return append(
      make("event", message),
      [
        make_text(old + " is now known as "),
        make_nick(message),
        timestamp(message)
      ]
    );

  case "PART":
    var nick = message.Prefix.Name;
    var name = message.Params[0];
    var msg = message.Params[1];
    return append(
      make("event", message),
      [
        make_nick(message),
        make_text(' has left' + (msg ? " ("+msg+")" : "")),
        timestamp(message)
      ]
    );

  case "MODE":
    if (message.Prefix.Nick == message.Params[0]) {
      return raw(message);
    }
    else {
      var channel = message.Params[0];
      return append(
        make("event", message),
        [
          make_text(message.Params.slice(1).join(" ")),
          make_text(" by " + message.Prefix.Name),
          timestamp(message)
        ]
      );
    }

  case "QUIT":
    var nick = message.Prefix.Name;
    var msg = message.Params[0];
    return append(
      make("event", message),
      [
        make_nick(message),
        make_text(' has quit' + (msg ? " ("+msg+")" : "")),
        timestamp(message)
      ]
    );

  case "JOIN":
    var name = message.Params[0];
    var nick = message.Prefix.Name;
    return append(
      make("event", message),
      [
        make_nick(message),
        make_text(' has joined the channel'),
        timestamp(message)
      ]
    );

  case "332":
    var name = message.Params[1];
    var text = message.Params[2];

    var span = append(
      make_text(),
      [
        make_text("Topic: "),
      ].concat(Format(text))
    );

    linkify(span);
    return append(
      make("event", message),
      [ span ]
    );

  case "TOPIC":
    var nick = message.Prefix.Name;
    var name = message.Params[0];
    var text = message.Params[1];

    var span = append(
      make_text(),
      [
        make_nick(message),
        make_text(" changed the topic: "),
      ].concat(Format(text))
    );

    linkify(span);
    return append(
      make("event", message),
      [
        span,
        timestamp(message)
      ]
    );

  case "PRIVMSG":
    var nick = message.Prefix.Name;
    var name = message.Params[0];
    var text = message.Params[1];

    if (!name.length || !text.length)
      return raw(message);

    var from = make_nick(message);
    var color = string_to_color(message.Prefix.User || nick);
    var msg = make_text();
    msg.setAttribute('class', 'message-text');
    from.style.color = color;

    if (text.substring(0, 1) == "\x01") {
      if (text.substring(1,7) == "ACTION") {
        from.textContent = '* ' + nick + ' ';
        append(msg, Format(text.substring(7)));
      }
      else {
        return;
      }
    }
    else {
      from.textContent = '< '+nick+'> ';
      append(msg, Format(text));
    }

    linkify(msg);

    var hash = md5(message.Raw);
    var li = make("message", message);
    li.setAttribute('data-message-hash', hash);

    return append(
      li,
      [
        flex(from, msg, timestamp(message)),
        controls(message)
      ]
    );

  case "NOTICE":
    var name = message.Prefix.Name;
    var text = message.Params[1];

    var chan = make_text(name);
    chan.setAttribute('class', 'channel');
    var span = append(
      make_text(' '),
      Format(text)
    );

    linkify(span);

    return append(
      make("raw notice", message),
      [chan, span]
    );

  case "CONNECT":
    var host = message.Params[0];

    if (!host)
      return;

    var host = message.Prefix.Name;
    var span = make_text(host + ' ');
    span.setAttribute('class', 'host');

    return append(
      make("raw notice", message),
      [ span, message.Params[0] ]
    );

  case "DISCONNECT":
    var host = message.Prefix.Name;
    var span = make_text(host + ' ');
    span.setAttribute('class', 'host');

    return append(
      make("raw notice", message),
      [ span, message.Params[0] ]
    );

  default:
    return raw(message);
  };

  function append(node, children) {
    for (var i=0; i < children.length; i++) {
      if (typeof(children[i]) === "string") {
        node.appendChild(document.createTextNode(children[i]));
      }
      else {
        try {
          node.appendChild(children[i]);
        } catch (e) {
          console.log(e, children[i]);
        }
      }
    }
    return node;
  };

  function make_text(text) {
    var el = document.createElement('SPAN');
    if (text)
      el.textContent = text;
    return el;
  }

  function make_nick(message) {
    var prefix = message.Prefix.Name
      + "!" + message.Prefix.User
      + "@" + message.Prefix.Server;

    var el = document.createElement('SPAN');
    el.setAttribute('data-nick', message.Prefix.Name);
    el.setAttribute('title', prefix);
    el.classList.add('message-nick');
    el.textContent = message.Prefix.Name;

    return el;
  }

  function raw (message) {
    var text = "";

    if (message.Command.match(/^[45][0-9][0-9]$/))
      text = message.Params.join(" ");
    else if (message.Command.match(/^[0-9][0-9][0-9]$/))
      text = message.Params.slice(1).join(" ");
    else
      text = [message.Prefix.Name, message.Command].concat(message.Params).join(" ");

    var raw = make("raw", message);
    raw.textContent = text;
    return raw;
  }

  function timestamp (message) {
    var date = new Date(message.Time * 1000);
    var h = String(date.getHours());
    if (h.length < 2)
      h = "0" + h;
    var m = String(date.getMinutes());
    if (m.length < 2)
      m = "0" + m;

    var time = document.createElement('TIME');
    time.setAttribute('data-time', message.Time);
    time.setAttribute('title', date.toString());
    time.textContent = h + ":" + m;

    return time;
  }

  function controls (message) {
    var controls = document.createElement('DIV');
    controls.classList.add('message-controls');

    if (!message.Prefix.Self) {
      var react = document.createElement('DIV');
      react.classList.add('message-react');
      controls.appendChild(react);
    }

    var menu = document.createElement('DIV');
    menu.classList.add('message-menu');

    controls.appendChild(menu);

    return controls;
  }

  function make (type, message) {
    var li = document.createElement("LI");
    li.classList.add("chat", message.Command.toLowerCase());
    var classes = type.split(" ");
    for (var i=0; i < classes.length; i++) {
      li.classList.add(classes[i]);
    }
    if (message.Prefix.Self)
      li.classList.add("self");
    if (message.Highlight)
      li.classList.add("highlight")
    if (message.Search)
      li.classList.add("search")

    if (message.Id)
      li.setAttribute('data-message-id', message.Id);
    return li;
  }

  function flex () {
    var wrap = document.createElement('DIV');
    wrap.setAttribute('class', 'message-flex');
    for (var i=0; i < arguments.length; i++) {
      wrap.appendChild(arguments[i]);
    }
    return wrap;
  }

  function string_to_color(str){
    var colors = [
      "MediumVioletRed",
      "PaleVioletRed",
      "DeepPink",
      "HotPink",
      "Red",
      "DarkRed",
      "FireBrick",
      "Crimson",
      "IndianRed",
      "Orange",
      "DarkOrange",
      "Coral",
      "Tomato",
      "OrangeRed",
      "Maroon",
      "Brown",
      "Sienna",
      "SaddleBrown",
      "Chocolate",
      "Peru",
      "DarkGoldenrod",
      "Goldenrod",
      "MidnightBlue",
      "MediumBlue",
      "Blue",
      "RoyalBlue",
      "SteelBlue",
      "CornflowerBlue",
      "DodgerBlue",
      "DeepSkyBlue",
      "LightSkyBlue",
      "SkyBlue",
      "MediumSlateBlue",
      "SlateBlue",
      "DarkSlateBlue",
      "Indigo",
      "Purple",
      "DarkMagenta",
      "DarkOrchid",
      "DarkViolet"
    ];

    var c = 0;
    var m = colors.length;

    for (var i = 0; i < str.length; i++) {
      c = ((c << 5) + str.charCodeAt(i)) % m
    }

    return colors[c];
  }
};

var url_re = /(https?:\/\/[^\s<"]*)/ig;

function linkify(elem) {
  var children = elem.childNodes;
  var length = children.length;

  for (var i=0; i < length; i++) {
    var node = children[i];
    if (node.nodeName == "A") {
      continue;
    }
    else if (node.nodeName != "#text") {
      linkify(node);
      continue;
    }
    if (node.nodeValue.match(url_re)) {
      var span = document.createElement("SPAN");
      var escaped = $('<div/>').text(node.nodeValue).html();
      span.innerHTML = escaped.replace(
        url_re, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
      node.parentNode.replaceChild(span, node);
      node = span;
    }
    if (Emoji.regex.test(node.nodeValue)) {
      var chars = node.nodeValue.match(Emoji.regex);
      var span = document.createElement("SPAN");
      var escaped = $('<div/>').text(node.nodeValue).html();

      for (var j=0; j < chars.length; j++) {
        var title = Emoji.names[chars[j]];
        escaped = escaped.replace(new RegExp(chars[j], 'g'), '<span title="'+title+'">' + chars[j] + '</span>');
      }
      span.innerHTML = escaped;
      node.parentNode.replaceChild(span, node);
    }
  }
}
