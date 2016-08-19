var Panel = function(name, id, connection) {
  var panel = this;

  panel.name = name;
  panel.id = id;
  panel.connection = connection;
  panel.unread = 0;
  panel.missed = 0;
  panel.type = determine_panel_type(name);
  panel.focused = false;
  panel.backlog_empty = false;
  panel.nicks = [];

  panel.change_name = function(name) {
    panel.name = name;
    panel.update_nav();
    panel.elem.prefix.text(name);
  };

  function determine_panel_type(name) {
    if (name == "status") return "status";
    if (name.match(/^[#&]/)) return "channel";
    return "private";
  }
  
  panel.update_completions = function(nicks) {
    panel.keyboard.completion.completions = nicks;
  };

  panel.focus = function() {
    panel.focused = true;
    panel.resize_filler();
    panel.elem.input.focus();
    panel.unread = 0;
    panel.missed = 0;
    panel.update_nav();
    panel.scroll();
  };

  panel.build_nav = function() {
    var el = $('<li/>', {'data-panel-id': id});
    var name = $('<span/>', {'class':'panel-name'}).text(panel.name);
    var pill = $('<span/>', {'class':'pill'});
    name.append(pill);
    el.append(name);
    return el;
  };

  panel.update_nav = function() {
    panel.elem.nav.find('.panel-name').text(panel.name);
    panel.elem.nav.find('.pill').text(panel.unread);

    if (panel.unread)
      panel.elem.nav.addClass('unread');
    else
      panel.elem.nav.removeClass('unread');

    if (panel.missed)
      panel.elem.nav.addClass('missed');
    else
      panel.elem.nav.removeClass('missed');

    if (panel.focused)
      panel.elem.nav.addClass('active');
    else
      panel.elem.nav.removeClass('active');
  };

  panel.incr_unread = function() {
    panel.unread++;
    if (panel.unread > 10)
      panel.unread = "10+"
    panel.update_nav();
  };

  panel.incr_missed = function() {
    panel.missed++;
    panel.update_nav();
  }

  panel.unfocus = function() {
    panel.focused = false;
    panel.elem.nav.removeClass("active");
  };

  panel.prepend = function(el) {
    panel.elem.list.prepend(el);
    panel.resize_filler();
  };

  panel.is_scrolled = function() {
    if (document.documentElement.scrollHeight <= window.innerHeight)
      return true;
    return window.scrollY == document.documentElement.scrollHeight - window.innerHeight;
  };

  panel.append = function(el) {
    var scrolled = panel.is_scrolled();
    panel.elem.list.append(el);

    if (panel.focused && scrolled) {
      panel.scroll();
    }
    else {
      if (el.hasClass("message"))
        panel.incr_unread();
      else (el.hasClass("event"))
        panel.incr_missed();
    }

    panel.resize_filler();
  };

  panel.resize_filler = function() {
    if (!panel.focused) return;

    panel.elem.filler.height(
      Math.max(0, window.innerHeight - panel.elem.list.outerHeight())
    );
  };

  panel.scroll = function() {
    var b = document.body;
    b.scrollTop = b.scrollHeight;
  };

  panel.own_message = function(nick, text) {
    var el = Render({
      Prefix: {Name: nick},
      Params: [panel.name, text],
      Command: "PRIVMSG"
    });
    panel.append(el);
    return el;
  };

  panel.oldest_message_id = function() {
    return panel.elem.list.find('li[data-message-id]:first').attr('data-message-id');
  };

  panel.update_topic = function(text) {
    panel.elem.topic.text(text);
    linkify(panel.elem.topic.get(0));
  };

  panel.elem = {
    input: $('<input/>', {
      'type': 'text',
      'data-panel-id': id
    }),
    list: $('<ol/>'),
    topic: $('<p>No topic set</p>'),
    filler: $('<div/>', {'class':'filler'}),
    prefix: $('<span/>').text(panel.name),
    nav: panel.build_nav()
  };

  panel.prune = function() {
    if (panel.focused && !panel.is_scrolled())
      return;

    var l = panel.elem.list.find('li:gt(' + 200 + ')').length;
    if (l) {
      panel.elem.list.find('li:lt(' + l + ')').remove();
      panel.elem.list.find('.backlog-block:empty').remove();
    }
  };

  panel.keyboard = new Keyboard(panel.elem.input.get(0));
  panel.pruner = setInterval(panel.prune, 1000 * 60);
};
