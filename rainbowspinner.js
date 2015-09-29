// @dependencies: jQuery & angular

!(function() {
  angular.module('rainbowSpinner', [])
    .directive('rainbowSpinner', rainbowSpinner)
    .service('timeStep', timeStep);

  rainbowSpinner.$inject = ['$timeout'];
  function rainbowSpinner($timeout) {
    return {
      restrict: 'A',
      require: ['rainbowSpinner'],
      link: getLink.bind(this, $timeout),
      controller: getController
    }
  }

  function getLink($timeout, $scope, $element, $attrs, ctrls) {
    var context = ctrls.shift();

    $timeout(function() {
      context.init($scope, $element, $attrs, ctrls);
      $scope.$on('$destroy', context.destroy);
    });
  }

  getController.$inject = ['$timeout', '$window', '$document', 'timeStep'];

  function getController($timeout, $window, $document, nbTimeStep) {
    var context = this;

    angular.extend(context, {
      init: defaultInit,
      resize: defaultResize,
      draw: defaultDraw,
      destroy: defaultDestroy,

      settings: {
        amount: 30, //seconds, key name 'amount' is from the old spinner where it based its seconds on the amount of colors in an array, yeah, don't ask.
        multiplier: 1, // rainbow multiplier, 2 means 2 times the full sprectrum spread across 360 degrees 
        fidelity: 5, // 5 is the magic number to get 60fps incrementals
        hsla: {
          saturation: '100%',
          lightness: '70%',
          alpha: '1'
        },
        lineWidthReduction: 12, // lineWidth is based on the proportions of the entire arc, this variable is used as a division, so ex. 12 means the lineWidth is 1/12th (+1/24th) of the radius
        arcMultiplier: 5, // replacement for fidelity.thickness, set to false (as attribute) to fall back on fidelity.thickness
        arcAngleGap: 0
        //lineWidth multiplier?
        //radius mulitplier?
      }
    });

    function defaultInit($scope, $element, $attrs, ctrls) {
      var settings = context.settings;

      angular.extend(context, {
        scope: $scope,
        element: $element,
        attrs: $attrs,
        ctrls: ctrls
      });

      if ($attrs['spinnerSeconds']) settings.amount = $scope.$eval($attrs['spinnerSeconds']);
      if ($attrs['spinnerMultiplier']) settings.multiplier = $scope.$eval($attrs['spinnerMultiplier']);
      if ($attrs['spinnerSettings']) angular.extend(settings, $scope.$eval($attrs['spinnerSettings']));
      if ($attrs['spinnerStrokeReduction']) settings.lineWidthReduction = $scope.$eval($attrs['spinnerStrokeReduction']);
      if ($attrs['spinnerArcMultiplier']) settings.arcMultiplier = $scope.$eval($attrs['spinnerArcMultiplier']);
      if ($attrs['spinnerArcAngleGap']) settings.arcAngleGap = $scope.$eval($attrs['spinnerArcAngleGap']);

      context._canvas = document.createElement('canvas');
      context._ctx = context._canvas.getContext('2d');

      $element.prepend(context._canvas);
      $element.css('position', 'absolute');

      context._fidelity = setFidelity(settings.fidelity, settings.amount);
      context._generateColor = colorGenerator(context._fidelity.total, settings.multiplier, settings.hsla);
      context._fixedTimeStep = new nbTimeStep.quickFixedTime();

      context.resize();
      angular.element($window).on('resize', context.resize);
    }

    function defaultDestroy() {
      if ((context.fixedTimeStep) && (context._running || context._fixedTimeStep.isRunning())) context.fixedTimeStep.stop();
    }

    function defaultResize() {
      var canvas = context._canvas,
        pixelRatio = 2,
        dimensions;

      dimensions = context._dimensions = getDimensions(context.element.parent()); //parent dimensions are affected by this element and therefor aren't accurate unless this element has position absolute css
      
      canvas.width = dimensions.width * pixelRatio;
      canvas.height = dimensions.height * pixelRatio;
      
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
      
      canvas.getContext('2d').scale(pixelRatio,pixelRatio);
      
      if (context._running && context._fixedTimeStep.isRunning()) context._fixedTimeStep.reset(); //should also do a redraw with the last state returned by reset()

      context.draw();
    }

    function defaultDraw() {
      var rtd = radianToDegrees,
        ctx = context._ctx,
        settings = context.settings,
        fidelity = context._fidelity,
        proportions = setArcProportions(context._dimensions, settings.lineWidthReduction),
        endTime = settings.amount * 1000; //multiply by milliseconds

      context._running = true;
      context._fixedTimeStep.start(drawArc);  
      

      ctx.arc( proportions.x, proportions.y, proportions.radius + (proportions.lineWidth/2) -1, 0, Math.PI*2, false );
      ctx.clip();
      
      function drawArc(state, timestamp, alpha) {
        var current = Math.round(state.tt / state.dt),
            arcMultiplier = settings.arcMultiplier || fidelity.thickness,
            arcAngleGap = settings.arcAngleGap || 0;
        
        //define arc slice
        ctx.beginPath();
        ctx.arc(proportions.x, proportions.y, proportions.radius, rtd(arcMultiplier * (current)), rtd((arcMultiplier * (current)) + (arcMultiplier - arcAngleGap)), false);
        
        // clear arc slices if there is a gap, preventing jagged edges from occuring between slices
        if (arcAngleGap){
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = proportions.lineWidth;
          ctx.stroke();
        } 
        
        //draw arc slice
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.strokeStyle = context._generateColor(current);
        ctx.lineWidth = proportions.lineWidth;
        ctx.stroke();
        ctx.closePath();
        
        //clip inside of circle
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc( proportions.x, proportions.y, proportions.radius - (proportions.lineWidth/2) +3, 0, Math.PI*2, false );
        ctx.fill();
        ctx.closePath(); 

        if ((endTime > 0) && state.tt >= endTime) context._running = false, context._lastState = this.stop(); //this is _fixedTimeStep, see its render() function
      }
    }

    function setFidelity(multiplier, amount) {
      var m = multiplier || 1,
        a = amount || 30000; //30 seconds

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
      var root = angular.element(root || window);

      return {
        width: root.innerWidth(),
        height: root.innerHeight()
      }
    }

    function radianToDegrees(degrees) {
      return (Math.PI / 180) * degrees;
    }

    function μExtend(destination, source) {
      return [].slice.call(arguments).reduceRight(function(source, destination) {
        Object.keys(source).forEach(function(key) {
          var value = source[key];
          if (value === void 0) return;
          destination[key] = value;
        });
        return destination;
      });
    }

  }

  timeStep.$inject = ['$window'];
  function timeStep($window) {
    return {
      quickFixedTime: defaultQuickFixedTime
    }

    //use with new statement, this isn't an object factory yet.
    function defaultQuickFixedTime(callback, state) {
      var context = this;

      angular.extend(context, {
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
        callback: callback || angular.noop
      });

      angular.extend(context.state, state);

      context.cleanState = {};
      angular.copy(context.state, context.cleanState);

      function defaultStart(callback) {
        if (callback) context.callback = callback;

        context._running = true;
        context.run();

        return context; //return constructor incase we chained this function with the new statement
      }

      function defaultStop() {
        context._running = false;

        if (context._raf) $window.cancelAnimationFrame(context._raf);
        context._raf = null;

        return context.state; //return the last state
      }

      function defaultReset() {
        var lastState = {};

        context.stop(); //stop the loop, jumping out of any current loop with local variables
        angular.copy(context.state, lastState);
        angular.copy(context.cleanState, context.state);

        return lastState; //return state before reset
      }

      function defaultIsRunning() {
        return context._running || false;
      }

      function defaultRun() {
        var state = context.state,
          currentTime, alpha;

        context._raf = $window.requestAnimationFrame(loop);

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
          context._raf = $window.requestAnimationFrame(loop);
        }
      }

      function defaultRender(state, timestamp, alpha) {
        var callback = context.callback || angular.noop;

        callback.call(context, state, timestamp, alpha);
      }

    }
  }

})();