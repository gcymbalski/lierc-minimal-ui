var Liercd = function(url) {
  var liercd = this;

  liercd.baseurl = url;
  liercd.stream;
  liercd.connections = {};
  liercd.filling_backlog = false;
  liercd.overlayed = false;
  liercd.panels = {};
  liercd.focused = null;

  liercd.elem = {
    panel: $('#panel'),
    nav: $('#nav'),
    'status': $('#status'),
    privates: $('#privates'),
    channels: $('#channels'),
    input: $('#input'),
    topic: $('#topic'),
    filler: $('#filler'),
    prefix: $('#prefix'),
    scroll: $('#panel-scroll').get(0),
    title: $('title'),
    nicks: $('#nicks'),
    body: $(document.body)
  };

  sortable('.sortable');

  function panel_id(name, connection) {
    return window.btoa(
      unescape(encodeURIComponent(name + connection))
    ).replace(/=+$/, "");
  }

  liercd.setup_connection = function(config) {
    if (liercd.connections[config.id])
      return;

    var connection = new Connection(config);

    var panel = liercd.add_panel("status", connection.id);
    panel.change_name(connection.config.Host);
    panel.update_topic("status.");

    connection.on("channel:new", function(conn, channel, message) {
      liercd.add_panel(channel, conn);
    });

    connection.on("private:msg", function(conn, nick, message) {
      var panel = liercd.add_panel(nick, conn);
      panel.append(Render(message));
    });

    connection.on("channel:msg", function(conn, channel, message) {
      var panel = liercd.get_panel(channel, conn);
      panel.append(Render(message));
    });

    connection.on("channel:nicks", function(conn, channel, nicks) {
      var panel = liercd.get_panel(channel, conn);
      panel.update_nicks(nicks);
    });

    connection.on("channel:close", function(conn, channel) {
      liercd.remove_panel(channel, conn);
    });

    connection.on("status:raw", function(conn, message) {
      var panel = liercd.get_panel("status", conn);
      panel.append(Render(message, true));
    });

    connection.on("status", function(conn, message) {
      var panel = liercd.get_panel("status", conn);
      panel.append(Render(message));
    });

    connection.on("channel:topic", function(conn, channel, text) {
      var panel = liercd.get_panel(channel, conn);
      panel.update_topic(text);
    });

    liercd.connections[connection.id] = connection;
  };

  liercd.init = function() {
    $.ajax({
      url: liercd.baseurl + '/connection',
      type: "GET",
      dataType: "json",
      success: function(configs) {
        if (!configs.length)
          liercd.config_modal();

        configs.forEach( function(config) {
          liercd.setup_connection(config);
        });

        if (!liercd.stream)
          liercd.connect();
      }
    });
  };

  liercd.connect = function() {
    var stream = new Stream(liercd.baseurl);

    stream.on('message', function(e) {
      var conn_id = e.ConnectionId;
      var message = e.Message;

      if (e.MessageId)
        message.Id =  e.MessageId;

      if (liercd.connections[conn_id]) {
        liercd.connections[conn_id].on_message(message);
      }
    });

    stream.on('close', function(e) {
      if (liercd.focused)
        liercd.focused.stream_status_change(false);
    });

    stream.on('open', function(e) {
      if (liercd.focused) {
        liercd.focused.stream_status_change(true);
        var newest = liercd.focused.latest_message_id();
        if (newest)
          liercd.fill_missed(liercd.focused, newest);
      }

      for (var id in liercd.panels) {
        if (!liercd.focused || id != liercd.focused.id) {
          liercd.panels[id].elem.list.html('');
        }
      }
    });

    liercd.stream = stream;
  };

  liercd.get_panel = function(name, connection) {
    var id = panel_id(name, connection);
    return liercd.panels[id];
  };

  liercd.remove_panel = function(name, connection) {
    var id = panel_id(name, connection);
    liercd.panels[id].elem.input.remove();
    liercd.panels[id].elem.list.remove();
    liercd.panels[id].elem.nav.remove();
    liercd.panels[id].elem.topic.remove();
    delete liercd.panels[id];
  };

  liercd.add_panel = function(name, connection) {
    var id = panel_id(name, connection);

    if (liercd.panels[id])
      return liercd.panels[id];

    var panel = new Panel(name, id, connection);
    liercd.panels[id] = panel;

    if (panel.type == "status")
      liercd.elem.status.append(panel.elem.nav);
    else if (panel.type == "private")
      liercd.elem.privates.append(panel.elem.nav);
    else
      liercd.elem.channels.append(panel.elem.nav);

    panel.elem.nav.on('click', function(e) {
      e.preventDefault();
      var id = $(this).attr('data-panel-id');
      liercd.focus_panel(id);
    });

    sortable('.sortable');

    if (!liercd.focused)
      liercd.focus_panel(id);

    return liercd.panels[id];
  };

  liercd.fill_missed = function(panel, stop, start) {
    var connection = liercd.connections[panel.connection];
    if (!connection) return;

    var name = panel.type == "status" ? "status" : panel.name;
    var parts = [
      liercd.baseurl, "connection", connection.id, "channel", encodeURIComponent(name), "events"
    ];

    if (start)
      parts.push(start);

    $.ajax({
      url: parts.join("/"),
      type: "GET",
      dataType: "json",
      success: function(events) {
        var insert = [];

        // newest to oldest
        for (var i=0; i < events.length; i++) {
          var e = events[i];
          var message = e.Message;
          message.Id = e.MessageId;

          // done if message is older than stop
          if (message.Id <= stop)
            break;

          insert.push(Render(message));
        }

        if (insert.length) {
          var block = $('<div/>', {'class':'backlog-block'});
          block.append(insert.reverse);
          panel.append(block);

          if (insert.length == 100) {
            liercd.fill_missed(panel, stop, insert[0].messageId);
          }
        }
      }
    });
  };

  liercd.fill_backlog = function(panel, msgid) {
    if (panel.backlog_empty) return;

    var connection = liercd.connections[panel.connection];
    if (!connection) return;

    var name = panel.type == "status" ? "status" : panel.name;
    var parts = [
      liercd.baseurl, "connection", connection.id, "channel", encodeURIComponent(name), "events"
    ];

    if (msgid)
      parts.push(msgid);

    $.ajax({
      url: parts.join("/"),
      type: "GET",
      dataType: "json",
      success: function(events) {
        if (events.length < 50)
          panel.backlog_empty = true;

        var block = $('<div/>', {'class':'backlog-block'});
        events.forEach( function (e) {
          var message = e.Message;
          message.Id = e.MessageId;
          block.prepend(Render(message));
        });

        panel.prepend(block);


        liercd.filling_backlog = false;
      }
    });
  };

  liercd.prev_panel = function() {
    var items = liercd.elem.nav.find("li");
    for (var i=items.length - 1; i >= 0; i--) {
      var item = $(items[i]);
      if (item.hasClass("active") && items[i - 1]) {
        var id = $(items[i - 1]).attr('data-panel-id');
        liercd.focus_panel(id);
        return;
      }
    }
  };

  liercd.prev_unread_panel = function() {
    var items = liercd.elem.nav.find("li");
    for (var i=items.length - 1; i >= 0; i--) {
      var item = $(items[i]);
      if (item.hasClass("active")) {
        for (var j=i; j >= 0; j--) {
          var item = $(items[j - 1]);
          if (item.hasClass("unread")) {
            var id = item.attr('data-panel-id');
            liercd.focus_panel(id);
            return;
          }
        }
        return;
      }
    }
  };

  liercd.next_panel = function() {
    var items = liercd.elem.nav.find("li");
    for (var i=0; i < items.length; i++) {
      var item = $(items[i]);
      if (item.hasClass("active") && items[i + 1]) {
        var id = $(items[i + 1]).attr('data-panel-id');
        liercd.focus_panel(id);
        return;
      }
    }
  }

  liercd.next_unread_panel = function() {
    var items = liercd.elem.nav.find("li");
    for (var i=0; i < items.length; i++) {
      var item = $(items[i]);
      if (item.hasClass("active")) {
        for (var j=i; j < items.length; j++) {
          var item = $(items[j + 1]);
          if (item.hasClass("unread")) {
            var id = item.attr('data-panel-id');
            liercd.focus_panel(id);
            return;
          }
        }
        return;
      }
    }
  };

  liercd.focus_panel = function(id) {
    var panel = liercd.panels[id];
    liercd.elem.panel.html(panel.elem.list);
    liercd.elem.input.html(panel.elem.input);
    liercd.elem.topic.html(panel.elem.topic);
    liercd.elem.filler.html(panel.elem.filler);
    liercd.elem.prefix.html(panel.elem.prefix);

    liercd.elem.body.attr("data-panel-type", panel.type);
    liercd.elem.nicks.html(panel.elem.nicks);

    liercd.elem.title.text(panel.name);

    for (id in liercd.panels) {
      liercd.panels[id].unfocus();
    }

    //liercd.scroll_to_nav(panel.elem.nav);

    panel.focus();
    liercd.focused = panel;
  };

  liercd.config_modal = function(e) {
    e.preventDefault();
    var url = liercd.baseurl + "/connection";
    var overlay = $('<div/>', {'class':'overlay'});
    overlay.append($('.config').clone().show());
    $('body').append(overlay);
    liercd.overlayed = true;

    overlay.on("click touchstart", "a.close", function(e) {
      e.preventDefault();
      liercd.overlayed = false;
      overlay.remove();
    });

    overlay.on("submit", function(e) {
      e.preventDefault();
      var form = $(e.target);

      var data = {
        Host: form.find('input[name=Host]').val(),
        Port: parseInt(form.find('input[name=Port]').val()),
        Ssl:  form.find('input[name=Ssl]').get(0).checked,
        Nick: form.find('input[name=Nick]').val(),
        User: form.find('input[name=User]').val(),
        Pass: form.find('input[name=Pass]').val(),
        Channels: form.find('input[name=Channels]').val().split(',')
      };

      $.ajax({
        url: url,
        type: "POST",
        dataType: "json",
        data: JSON.stringify(data),
        success: function(res) {
          overlay.remove();
          liercd.overlayed = false;
          liercd.init();
        },
        error: function(res) {
          console.log(res);
          alert("i'm sorry");
        }
      });
    });
  };

  liercd.check_scroll = function() {
    if (liercd.filling_backlog) return;
    if (!liercd.focused) return;

    if (liercd.elem.scroll.scrollTop <= 100) {
      if (!liercd.connections[liercd.focused.connection])
        return;
      if (liercd.focused.backlog_empty) return;
      liercd.filling_backlog = true;
      liercd.fill_backlog(
        liercd.focused, liercd.focused.oldest_message_id()
      );
    }
  };

  setInterval(liercd.check_scroll, 1000);

  $('#toggle-nicks').on('click touchstart', function(e) {
    e.preventDefault();
    scroll = liercd.focused && liercd.focused.is_scrolled();
    $('.nicks-wrap').toggleClass("hidden");
    if (scroll) liercd.focused.scroll();
  });

  $('#add-connection').on('click touchstart', liercd.config_modal);

  liercd.elem.input.on("submit", function(e) {
    e.preventDefault();
    var input = $(e.target).find("input");
    var value = input.val();
    input.val("");

    var panel = liercd.panels[input.attr('data-panel-id')];
    var connection = liercd.connections[panel.connection];
    var privmsg = false;
    var method = "POST";

    if (value.substring(0,1) == "/") {
      var command = value.substring(1).split(/\s+/, 2);
      value = command[0].toUpperCase();
      if (value.match(/QUIT/i)) {
        method = "DELETE";
      }
      else if (value.match(/^PART|QUIT|CLOSE|WC/i)) {
        if (panel.type == "channel") {
          value = "PART " + panel.name;
        }
        else {
          return liercd.remove_panel(panel.name, panel.connection);
        }
      }
      if (command.length == 2) {
        value += " :" + command[1];
      }
    }
    else if (panel.type != "status") {
      privmsg = value;
      value = "PRIVMSG " + panel.name + " :" + value;
    }

    $.ajax({
      url: liercd.baseurl + "/connection/" + panel.connection,
      type: method,
      dataType: "json",
      data: value,
      success: function(res) {
        if (method == "DELETE")
          window.location.reload();
      }
    });
  });

  var meta_down = false;
  var shift_down = false;
  var ctrl_down = false;

  document.addEventListener("keydown", function(e) {
    if (e.which == 17) {
      ctrl_down = true;
      return;
    }

    if (e.which == 18) {
      meta_down = true;
      return;
    }

    if (e.which == 16) {
      shift_down = true;
      return;
    }

    if (liercd.overlayed) return;

    if (e.which == 38 && meta_down) {
      e.preventDefault();
      shift_down ? liercd.prev_unread_panel() : liercd.prev_panel();
      return;
    }

    if (e.which == 40 && meta_down) {
      e.preventDefault();
      shift_down ? liercd.next_unread_panel() : liercd.next_panel();
      return;
    }

    if (liercd.focused) {
      if (liercd.focused.keyboard.focused)
        liercd.focused.keyboard.keydown(e);
      else if (! meta_down && ! ctrl_down && String.fromCharCode(e.which).match(/[a-zA-Z0-9]/))
        liercd.focused.elem.input.focus();
    }
  });

  window.addEventListener("blur", function(e) {
    shift_down = false;
    meta_down = false;
    ctrl_down = false;
  });

  window.addEventListener("focus", function(e) {
    shift_down = false;
    meta_down = false;
    ctrl_down = false;
    liercd.focused.elem.input.focus();
  });

  document.addEventListener("keyup", function(e) {
    if (e.which == 18)
      meta_down = false;
    if (e.which == 16)
      shift_down = false;
    if (e.which == 17)
      ctrl_down = false;
  });

  $(document).on('click', '[data-nick]', function(e) {
    e.preventDefault();
    var nick = $(this).attr('data-nick');
    var connection = liercd.focused.connection;
    var panel = liercd.add_panel(nick, connection);
    liercd.focus_panel(panel.id);
  });

  liercd.elem.prefix.on('click touchstart', function(e) {
    e.preventDefault();
    $('.flex-wrap').toggleClass("open");
  });

  $('#help').on('click touchstart', function(e) {
    e.preventDefault();
    var overlay = $('<div/>', {'class':'overlay'});
    overlay.append($('.help').clone().show());
    $('body').append(overlay);
    liercd.overlayed = true;
    overlay.on('touchstart click', function(e) {
      e.preventDefault();
      overlay.remove();
      liercd.overlayed = false;
    });
  });

  $('#logout').on('click touchstart', function(e) {
    e.preventDefault();

    if (!confirm("Are you sure you want to log out?"))
      return;

    $.ajax({
      url: liercd.baseurl + "/logout",
      type: "POST",
      dataType: "json",
      complete: function() {
        window.location.reload();
      }
    });
  });

  $(window).on('resize', function(e) {
    if (liercd.focused)
      liercd.focused.scroll();
    console.log('resize');
  });

  liercd.init();
};

