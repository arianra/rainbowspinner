
!(function(){
  var TWO_PI = Math.PI*2,
      RADIANS = Math.PI / 180;

  window.RainbowSpinner = RainbowSpinner;
  window.TimeStep = TimeStep;

  function RainbowSpinner(container, settings){
    var context = this,
        container = $(container);

    $.extend(context, {
      init: defaultInit,
      resize: defaultResize,
      draw: defaultDraw,

      container: container,
      settings: {
        seconds: 0, 
        multiplier: 8, 
        fidelity: 5, 
        lineWidthReduction: 12, 
        arcMultiplier: 5,
        hsla: {
          saturation: '100%',
          lightness: '70%',
          alpha: '1'
        }
      }
    });

    if( settings ) $.extend( context.settings, settings );

    function defaultInit(){
      var settings = context.settings;

      context._canvas = document.createElement('canvas');
      context._ctx = context._canvas.getContext('2d');

      container.prepend(context._canvas);
      container.css('position', 'absolute');

      context._fidelity = setFidelity(settings.fidelity, settings.seconds);
      context._generateColor = colorGenerator(context._fidelity.total, settings.multiplier, settings.hsla);
      context._fixedTimeStep = new TimeStep();

      context.resize();
      $(window).on('resize', context.resize);

      return context;
    }

    function defaultResize(){
      var canvas = context._canvas,
          pixelRatio = 2,
          dimensions;

      dimensions = context._dimensions = getDimensions(container.parent()); //parent dimensions are affected by this element and therefor aren't accurate unless this element has position absolute css
      
      canvas.width = dimensions.width * pixelRatio;
      canvas.height = dimensions.height * pixelRatio;      
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
      
      canvas.getContext('2d').scale(pixelRatio, pixelRatio);
      
      if (context._running && context._fixedTimeStep.isRunning()) context._fixedTimeStep.reset(); //should also do a redraw with the last state returned by reset()

      context.draw();
    }
    function defaultDraw(){
      var rtd = radianToDegrees,
          ctx = context._ctx,
          settings = context.settings,
          fidelity = context._fidelity,
          proportions = setArcProportions(context._dimensions, settings.lineWidthReduction),
          endTime = settings.seconds * 1000; //multiply by milliseconds

      context._running = true;
      context._fixedTimeStep.start(drawArc);  
      
      ctx.arc( proportions.x, proportions.y, proportions.radius + (proportions.lineWidth/2), 0, TWO_PI, false );
      ctx.clip();
      
      function drawArc(state, timestamp, alpha) {
        var current = Math.round(state.tt / state.dt),
            arcMultiplier = settings.arcMultiplier || fidelity.thickness;
        
        ctx.beginPath();
        ctx.arc(proportions.x, proportions.y, proportions.radius, rtd(arcMultiplier * (current)), rtd((arcMultiplier * (current)) + (arcMultiplier)), false);   
        
        ctx.globalCompositeOperation = 'source-over';              
        ctx.strokeStyle = context._generateColor(current);
        ctx.lineWidth = proportions.lineWidth;
        ctx.stroke();
        ctx.closePath();
        
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc( proportions.x, proportions.y, proportions.radius - (proportions.lineWidth/2) +3, 0, Math.PI*2, false );
        ctx.fill();
        ctx.closePath(); 

        if ((endTime > 0) && state.tt >= endTime) context._running = false, context._lastState = this.stop(); //this is _fixedTimeStep, see its render() function
      }
    }

    function setFidelity(multiplier, seconds) {
      var m = multiplier || 1,
        a = seconds || 30000; //30 seconds

      return {
        total: 360 * m,
        thickness: 1 / m,
        step: a / (360 * m)
      }
    }

    function setArcProportions(dimensions, lineWidthReduction) {
      var bounds = (dimensions.width <= dimensions.height) ? dimensions.width : dimensions.height,
        lineWidthRedux = lineWidthReduction || 12;

      return {
        x: (dimensions.width / 2),
        y: (dimensions.height / 2),
        lineWidth: (bounds / lineWidthRedux),
        radius: (bounds / 2) - (bounds / (lineWidthRedux * 2))
      }
    }

    //
    //  separate logic
    //
    function colorGenerator(total, multiplier, hsla) {
      var hsla = hsla || context.settings.hsla;

      return function(amount) {
        return 'hsla\(' + ((amount * multiplier) * (360 / total)) + ', ' + hsla.saturation + ', ' + hsla.lightness + ', ' + hsla.alpha + '\)';
      }
    }

    function getDimensions(root) {
      var root = $(root || window);

      return {
        width: root.innerWidth(),
        height: root.innerHeight()
      }
    }

    function radianToDegrees(degrees) {
      return RADIANS * degrees;
    }

    return context.init();
  }

  function TimeStep(callback){
    var context = this;

    $.extend(context, {
        start: defaultStart,
        stop: defaultStop,
        reset: defaultReset,
        isRunning: defaultIsRunning,
        run: defaultRun,
        render: defaultRender,

        state: {
          cap: 83.33333333333333, // cap (bound to max) time between frames. 83.333 is 12fps
          dt: 16.666666666666668, // delta time, time between frames. is fixed. ideal dt is 60fps,
          accumulator: 0, // accumulated time, starts as frame time, ends as remainder alpha for next delta time (ex. 0.5 is dt/2)
          tt: 0, // total time
          ft: 0 // frame time, time since last frame
        },
        callback: callback || function(){}
    });

    context.cleanState = $.extend(true, {}, context.cleanState);

    function defaultStart(callback){
      if (callback) context.callback = callback;

      context._running = true;
      context.run();

      return context; //return constructor incase we chained this function with the new statement  
    }

    function defaultStop(){
      context._running = false;

      if (context._raf) window.cancelAnimationFrame(context._raf);
      context._raf = null;

      return context.state; //return the last state
    }

    function defaultReset(){
      var lastState;

      context.stop(); //stop the loop, jumping out of any current loop with local variables
      lastState = $.extend(true, {}, context.state);
      context.state = $.extend(true, {}, context.cleanState);

      return lastState; //return state before reset
    }

    function defaultIsRunning(){ 
      return context._running || false; 
    }

    function defaultRun(){
      var state = context.state,
          currentTime, alpha;

      context._raf = window.requestAnimationFrame(loop);

      function loop(timestamp) {
        if (!currentTime) currentTime = timestamp; //doing it inside because too lazy to check compatibility with Performance.now(), just set it to whatever raf gives you, whether or not raf is polyfilled

        var frameTime = (timestamp - currentTime);
        if (frameTime > state.cap) frameTime = state.cap;

        state.lastTimestamp = currentTime;
        currentTime = timestamp;

        state.accumulator += frameTime;
        state.ft = frameTime;

        while (state.accumulator >= state.dt) {
          context.render(state, currentTime);

          state.tt += state.dt;
          state.accumulator -= state.dt;
        };

        alpha = (state.accumulator / state.dt); // remainder until the next frame
        context.render(state, currentTime, alpha);

        if (!context._running) return;
        context._raf = window.requestAnimationFrame(loop);
      }
    }

    function defaultRender(state, timestamp, alpha){
      var callback = context.callback || function(){};

      callback.call(context, state, timestamp, alpha);
    }

    return context;
  }

})();