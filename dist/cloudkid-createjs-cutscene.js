/*! CreateJSCutscene 0.0.1 */
(function(){
	
	var CreateJSCutscene = function(options)
	{
		createjs.Container.call(this);
		this.setup(options);
	};
	
	/**
	* The prototype extaends the easeljs Container class
	* @private
	*/
	var p = CreateJSCutscene.prototype = new createjs.Container();
	
	/**
	*  When the ComicCreator is ready to use
	*  @private
	*/
	p.isReady = false;
	
	/**
	*  The framerate the comic should play at.
	*  @private
	*/
	p.framerate = 0;
	
	/**
	* Reference to the display we are drawing on
	* @public
	*/
	p.display = null;
	
	/** The source url for the config until it is loaded, then the config object. */
	p.config = null;
	p.imageScale = 1;
	p.pathReplaceTarg = null;
	p.pathReplaceVal = null;
	
	p._taskMan = null;
	p._loadingImages = null;
	
	p._elapsedTime = 0;//the time elapsed in the current page
	p._clip = null;
	p._currentAudioInstance = null;
	p._animFinished = false;
	p._audioFinished = false;
	p._captionsObj = null;
	
	p._loadCallback = null;
	p._endCallback = null;
	
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

		this.loadConfig();
	};
	
	p.loadConfig = function()
	{
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
	
	p.onAudioLoaded = function()
	{
		//do nothing
	};
	
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
						BitmapUtils.replaceWithScaledBitmap(key, imgScale);
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
				BitmapUtils.loadSpriteSheet(atlasData[id].frames, atlasImages[id], this.imageScale);
			}
		}
	};

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
		clip.gotoAndStop(0);
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
	
	p.resize = function(width, height)
	{
		if(!this._clip) return;
		
		var scale = height / this.config.settings.designedHeight;
		this._clip.scaleX = this._clip.scaleY = scale;
		this.x = (width - this.config.settings.designedWidth * scale) * 0.5;
	};
	
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
	
	p._audioCallback = function()
	{
		this._audioFinished = true;
		this._currentAudioInstance = null;
		if(this._animFinished)
		{
			this.stop(true);
		}
	};
	
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
		_clip.elapsedTime = this._timeElapsed;
		if(_clip.currentFrame == _clip.timeline.duration)
		{
			this._animFinished = true;
			if(this._audioFinished)
			{
				this.stop(true);
			}
		}
	};

	p.stop = function(doCallback)
	{
		cloudkid.Application.instance.off("update", this.update);
		cloudkid.Application.instance.off("resize", this.resize);
		if(this._currentAudioInstance)
			cloudkid.Sound.instance.stop(this.config.audio.soundManifest[0].id);
		this._captionsObj.stop();

		if(doCallback && this._endCallback)
		{
			this._endCallback();
			this._endCallback = null;
		}
	};
	
	p.destroy = function()
	{
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
		this.display.removeChild(this);
		this.display = null;
	};
	
	namespace("cloudkid").CreateJSCutscene = CreateJSCutscene;
}());