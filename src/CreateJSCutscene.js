/**
*  @module cloudkid
*/
(function(){
	
	"use strict";

	/**
	*   CreateJSCutscene is a class for playing a single EaselJS animation synced to a
	*	single audio file with cloudkid.Sound, with optional captions.
	*
	*   @class CreateJSCutscene
	*	@constructor
	*	@param {Object} options The runtime specific setup data for the cutscene.
	*	@param {String|Display} options.display The display or display id of the CreateJSDisplay to draw on.
	*	@param {String} options.configUrl The url of the json config file describing the cutscene. See the example project.
	*	@param {Function} [options.loadCallback] A function to call when loading is complete.
	*	@param {String} [options.pathReplaceTarg] A string found in the paths of images that should be replaced with another value.
	*	@param {String} [options.pathReplaceVal] The string to use when replacing options.pathReplaceTarg.
	*	@param {Number} [options.imageScale=1] Scaling to apply to all images loaded for the cutscene.
	*	@param {cloudkid.Captions} [options.captions] A Captions instance to display captions text on.
	*/
	var CreateJSCutscene = function(options)
	{
		createjs.Container.call(this);
		this.setup(options);
	};
	
	var p = CreateJSCutscene.prototype = new createjs.Container();
	
	/**
	*	When the cutscene is ready to use
	*	@property {Boolean} isReady
	*	@public
	*/
	p.isReady = false;
	
	/**
	*	The framerate the cutscene should play at.
	*	@property {int} framerate
	*	@private
	*/
	p.framerate = 0;
	
	/**
	*	Reference to the display we are drawing on
	*	@property {Display} display
	*	@public
	*/
	p.display = null;
	
	/**
	*	The source url for the config until it is loaded, then the config object.
	*	@property {String|Object} config
	*	@private
	*/
	p.config = null;
	/**
	*	The scaling value for all images.
	*	@property {Number} imageScale
	*	@private
	*/
	p.imageScale = 1;
	/**
	*	A string found in the paths of images that should be replaced with another value.
	*	@property {String} pathReplaceTarg
	*	@private
	*/
	p.pathReplaceTarg = null;
	/**
	*	The string to use when replacing options.pathReplaceTarg.
	*	@property {String} pathReplaceVal
	*	@private
	*/
	p.pathReplaceVal = null;
	/**
	*	The TaskManager used to load up assets.
	*	@property {cloudkid.TaskManager} _taskMan
	*	@private
	*/
	p._taskMan = null;
	/**
	*	The time elapsed in seconds.
	*	@property {Number} _elapsedTime
	*	@private
	*/
	p._elapsedTime = 0;
	/**
	*	The clip that is being animated.
	*	@property {easeljs.MovieClip} _clip
	*	@private
	*/
	p._clip = null;
	/**
	*	The sound instance of the playing audio
	*	@property {cloudkid.Sound.soundInst} _currentAudioInstance
	*	@private
	*/
	p._currentAudioInstance = null;
	/**
	*	If the animation has finished playing.
	*	@property {Boolean} _animFinished
	*	@private
	*/
	p._animFinished = false;
	/**
	*	If the audio has finished playing.
	*	@property {Boolean} _audioFinished
	*	@private
	*/
	p._audioFinished = false;
	/**
	*	The Captions object to use to manage captions.
	*	@property {cloudkid.Captions} _captionsObj
	*	@private
	*/
	p._captionsObj = null;
	/**
	*	The function to call when loading is complete.
	*	@property {Function} _loadCallback
	*	@private
	*/
	p._loadCallback = null;
	/**
	*	The function to call when playback is complete.
	*	@property {Function} _endCallback
	*	@private
	*/
	p._endCallback = null;
	
	/**
	*   Called from the constructor to complete setup and start loading.
	*
	*   @method setup
	*	@param {Object} options The runtime specific setup data for the cutscene.
	*	@param {String|Display} options.display The display or display id of the CreateJSDisplay to draw on.
	*	@param {String} options.configUrl The url of the json config file describing the cutscene. See the example project.
	*	@param {Function} [options.loadCallback] A function to call when loading is complete.
	*	@param {String} [options.pathReplaceTarg] A string found in the paths of images that should be replaced with another value.
	*	@param {String} [options.pathReplaceVal] The string to use when replacing options.pathReplaceTarg.
	*	@param {Number} [options.imageScale=1] Scaling to apply to all images loaded for the cutscene.
	*	@param {cloudkid.Captions} [options.captions] A Captions instance to display captions text on.
	*	@private
	*/
	p.setup = function(options)
	{
		if(!options)
			throw new Error("need options to create CreateJSCutscene");
		
		this.display = typeof options.display == "string" ? cloudkid.Application.instance.getDisplay(options.display) : options.display;
		this.config = options.configUrl;
		this._loadCallback = options.loadCallback || null;
		this.imageScale = options.imageScale || 1;
		this.pathReplaceTarg = options.pathReplaceTarg || null;
		this.pathReplaceVal = options.pathReplaceVal || null;
		this._captionsObj = options.captions || null;
		
		//bind some callbacks
		this.update = this.update.bind(this);
		this._audioCallback = this._audioCallback.bind(this);
		this.resize = this.resize.bind(this);

		this.display.stage.addChild(this);

		var tasks = [];
		tasks.push(new cloudkid.LoadTask("config", this.config, this.onConfigLoaded.bind(this)));
		// create a texture from an image path
		this._taskMan = new cloudkid.TaskManager(tasks);
		this._taskMan.addEventListener(
			cloudkid.TaskManager.ALL_TASKS_DONE, 
			this.onLoadComplete.bind(this)
		);
		this._taskMan.startAll();
	};
	
	/**
	*	Callback for when the config file is loaded.
	*	@method onConfigLoaded
	*	@param {cloudkid.MediaLoaderResult} result The loaded result.
	*	@private
	*/
	p.onConfigLoaded = function(result)
	{
		this.config = result.content;
		
		if(this._captionsObj)
			this._captionsObj.setDictionary(this.config.captions);
		
		//parse config
		this.framerate = this.config.settings.fps;
		
		//figure out what to load
		var manifest = [];
		//the javascript file
		manifest.push({id:"clip", src:this.config.settings.clip});
		//all the images
		for(var key in this.config.images)
		{
			var url = this.pathReplaceTarg ? this.config.images[key].replace(this.pathReplaceTarg, this.pathReplaceVal) : this.config.images[key];
			manifest.push({id:key, src:url});
		}
		
		var soundConfig = this.config.audio;
		cloudkid.Sound.instance.loadConfig(soundConfig);//make sure Sound knows about the audio
		
		this._taskMan.addTask(new cloudkid.ListTask("art", manifest, this.onArtLoaded.bind(this)));
		this._taskMan.addTask(cloudkid.Sound.instance.createPreloadTask("audio", [soundConfig.soundManifest[0].id], this.onAudioLoaded));
	};
	
	/**
	*	Callback for when the audio has been preloaded.
	*	@method onAudioLoaded
	*	@private
	*/
	p.onAudioLoaded = function()
	{
		//do nothing
	};
	
	/**
	*	Callback for when all art assets have been loaded.
	*	@method onArtLoaded
	*	@param {Object} results The loaded results.
	*	@private
	*/
	p.onArtLoaded = function(results)
	{
		if(!window.images)
			window.images = {};
		var atlasData = {}, atlasImages = {}, id;
		for(id in results)
		{
			var result = results[id].content;
			if(id.indexOf("atlasData_") === 0)//look for spritesheet data
			{
				atlasData[id.replace("atlasData_", "")] = result;
			}
			else if(id.indexOf("atlasImage_") === 0)//look for spritesheet images
			{
				atlasImages[id.replace("atlasImage_", "")] = result;
			}
			else if(id == "clip")//look for the javascript animation file
			{
				//the javascript file
				//if bitmaps need scaling, then do black magic to the object prototypes so the scaling is built in
				if(this.imageScale != 1)
				{
					var imgScale = this.imageScale;
					for(var key in this.config.images)
					{
						createjs.BitmapUtils.replaceWithScaledBitmap(key, imgScale);
					}
				}
			}
			else//anything left must be individual images that we were expecting
			{
				images[id] = result;
			}
		}
		for(id in atlasData)//if we loaded any spritesheets, load them up
		{
			if(atlasData[id] && atlasImages[id])
			{
				createjs.BitmapUtils.loadSpriteSheet(atlasData[id].frames, atlasImages[id], this.imageScale);
			}
		}
	};

	/**
	*	Callback for when all loading is complete.
	*	@method onLoadComplete
	*	@param {Event} evt An event
	*	@private
	*/
	p.onLoadComplete = function(evt)
	{
		this._taskMan.removeAllEventListeners();
		this._taskMan.destroy();
		this._taskMan = null;
		
		var clip = this._clip = new lib[this.config.settings.clipClass]();
		//if the animation was for the older ComicCutscene, we should handle it gracefully
		//so if the clip only has one frame or is a container, then we get the child of the clip as the animation
		if(!this._clip.timeline || this._clip.timeline.duration == 1)
			clip = this._clip.getChildAt(0);
		clip.mouseEnabled = false;
		clip.framerate = this.framerate;
		clip.advanceDuringTicks = false;
		clip.gotoAndPlay(0);//internally, movieclip has to be playing to change frames during tick() or advance().
		clip.loop = false;
		this.addChild(this._clip);
		
		this.resize(this.display.width, this.display.height);
		cloudkid.Application.instance.on("resize", this.resize);
		
		this.isReady = true;
		
		if(this._loadCallback)
		{
			this._loadCallback();
			this._loadCallback = null;
		}
	};
	
	/**
	*	Listener for when the Application is resized.
	*	@method resize
	*	@param {int} width The new width of the display.
	*	@param {int} height The new height of the display.
	*	@private
	*/
	p.resize = function(width, height)
	{
		if(!this._clip) return;
		
		var scale = height / this.config.settings.designedHeight;
		this._clip.scaleX = this._clip.scaleY = scale;
		this.x = (width - this.config.settings.designedWidth * scale) * 0.5;

		//if the display is paused, tell it to render once since the display just got wiped
		if(this.isReady && this.display.paused)
		{
			this.display.paused = false;
			this.display.render(0);
			this.display.paused = true;
		}
	};
	
	/**
	*	Starts playing the cutscene.
	*	@method start
	*	@param {Function} callback The function to call when playback is complete.
	*	@public
	*/
	p.start = function(callback)
	{
		this._endCallback = callback;

		this._timeElapsed = 0;
		this._animFinished = false;
		this._audioFinished = false;
		var id = this.config.audio.soundManifest[0].id;
		this._currentAudioInstance = cloudkid.Sound.instance.play(id, this._audioCallback);
		if(this._captionsObj)
			this._captionsObj.run(id);
		cloudkid.Application.instance.on("update", this.update);
	};
	
	/**
	*	Callback for when the audio has finished playing.
	*	@method _audioCallback
	*	@private
	*/
	p._audioCallback = function()
	{
		this._audioFinished = true;
		this._currentAudioInstance = null;
		if(this._animFinished)
		{
			this.stop(true);
		}
	};
	
	/**
	*	Listener for frame updates.
	*	@method update
	*	@param {int} elapsed Time in milliseconds
	*	@private
	*/
	p.update = function(elapsed)
	{
		if(this._animFinished) return;
		
		if(this._currentAudioInstance)
		{
			var pos = this._currentAudioInstance.position * 0.001;
			//sometimes (at least with the flash plugin), the first check of the position would be very incorrect
			if(this._timeElapsed === 0 && pos > elapsed * 2)
			{
				//do nothing here
			}
			else if(this._currentAudioInstance)//random bug? - check avoids an unlikely null ref error
				this._timeElapsed = this._currentAudioInstance.position * 0.001;//save the time elapsed
		}
		else
			this._timeElapsed += elapsed * 0.001;
		if(this._captionsObj)
			this._captionsObj.seek(this._timeElapsed * 1000);
		//set the elapsed time of the clip
		var clip = (!this._clip.timeline || this._clip.timeline.duration == 1) ? this._clip.getChildAt(0) : this._clip;
		clip.elapsedTime = this._timeElapsed;
		if(clip.currentFrame == clip.timeline.duration)
		{
			this._animFinished = true;
			if(this._audioFinished)
			{
				this.stop(true);
			}
		}
	};

	/**
	*	Stops playback of the cutscene.
	*	@method stop
	*	@param {Boolean} [doCallback=false] If the end callback should be performed.
	*	@public
	*/
	p.stop = function(doCallback)
	{
		cloudkid.Application.instance.off("update", this.update);
		if(this._currentAudioInstance)
			cloudkid.Sound.instance.stop(this.config.audio.soundManifest[0].id);
		this._captionsObj.stop();

		if(doCallback && this._endCallback)
		{
			this._endCallback();
			this._endCallback = null;
		}
	};
	
	/**
	*	Destroys the cutscene.
	*	@method destroy
	*	@public
	*/
	p.destroy = function()
	{
		cloudkid.Application.instance.off("resize", this.resize);
		this.removeAllChildren(true);
		cloudkid.Sound.instance.unload([this.config.audio.soundManifest[0].id]);//unload audio
		this.config = null;
		if(this._taskMan)
		{
			this._taskMan.removeAllEventListeners();
			this._taskMan.destroy();
			this._taskMan = null;
		}
		this._currentAudioInstance = null;
		this._loadCallback = null;
		this._endCallback = null;
		this._clip = null;
		this._captionsObj = null;
		this.display.stage.removeChild(this);
		this.display = null;
	};
	
	namespace("cloudkid").CreateJSCutscene = CreateJSCutscene;
}());