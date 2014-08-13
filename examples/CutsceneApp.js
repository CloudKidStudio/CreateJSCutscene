(function() {
	var CutsceneApp = function(options)
	{
		Application.call(this, options);
	}
	
	// Import library dependencies
	var Point = createjs.Point,
		Graphics = createjs.Graphics,
		Shape = createjs.Shape,
		Application = cloudkid.Application,
		MediaLoader = cloudkid.MediaLoader;
	
	// Extend the createjs container
	var p = CutsceneApp.prototype = Object.create(Application.prototype);

	// the cutscene
	var cutscene;
	
	// The stop/replay button
	var button;

	var captionsText;

	//If the cutscene is playing
	var isCutscenePlaying = false;
	
	/**
	* @protected
	*/
	p.init = function()
	{
		Debug.log("CutsceneApp is ready to use.");
		
		this.onResize = this.onResize.bind(this);
		this.on("resize", this.onResize);
		this.onPaused = this.onPaused.bind(this);
		this.on("pause", this.onPaused);

		//initialize SoundJS
		var basePath = this.options.basePath;
		var url;
		if (basePath !== undefined)
			url = basePath + "audio/";
		else
			url = "audio/";
		createjs.FlashPlugin.BASE_PATH = url;
		cloudkid.Sound.init(
			[createjs.WebAudioPlugin, createjs.FlashPlugin],
			["ogg", "mp3"],
			this.startLoading.bind(this));
	};

	p.startLoading = function()
	{
		MediaLoader.instance.load(
			'images/button.png', 
			this._onButtonLoaded.bind(this)
		);
	};

	/**
	*  Callback for the button  
	*/
	p._onButtonLoaded = function(result)
	{		
		button = new cloudkid.Button(result.content, {
			text: "Stop",
			font: "20px Arial",
			color: "#ffffff"
		});
		
		var h = this.display.height;
		button.scaleX = button.scaleY = h / 500;
		button.x = this.display.width - button.width - 5;
		button.y = this.display.height - button.height - 5;
		
		button.addEventListener(cloudkid.Button.BUTTON_PRESS, this._onButton.bind(this));
		button.enabled = false;

		captionsText = new createjs.Text("", "bold 24px Helvetica, Arial, sans-serif", "#000000");
		captionsText.stroke = {width:4, color:"#ffffff"};
		captionsText.textAlign = "center";
		captionsText.scaleX = captionsText.scaleY = h / 500;
		captionsText.x = 450 * captionsText.scaleX;
		captionsText.y = 20 * captionsText.scaleY;
		captionsText.lineWidth = 500;

		var opts = {};
		opts.display = "stage";
		opts.configUrl = "Intro.json";
		opts.loadCallback = this.onCutsceneLoaded.bind(this);
		opts.pathReplaceTarg = "%scale%";
		opts.pathReplaceVal = this.display.height < 350 ? "tiny" : "sd";
		opts.imageScale = this.display.height < 350 ? 2 : 1;
		opts.captions = new cloudkid.Captions(null, captionsText);
		opts.captions.textIsProp = true;
		opts.captions.isSlave = true;

		cutscene = new cloudkid.CreateJSCutscene(opts);

		this.display.stage.addChild(cutscene);
		this.display.stage.addChild(captionsText);
		this.display.stage.addChild(button);
	};

	p.onCutsceneLoaded = function()
	{
		button.enabled = true;
		cutscene.start(this.onCutsceneFinished.bind(this));
		isCutscenePlaying = true;
	};

	p.onCutsceneFinished = function()
	{
		button.setText("Replay");
		isCutscenePlaying = false;
	};
	
	/**
	*   start or replay the cutscene 
	*/
	p._onButton = function()
	{
		if(isCutscenePlaying)
		{
			cutscene.stop();
			button.setText("Replay");
			isCutscenePlaying = false;
		}
		else
		{
			cutscene.start(this.onCutsceneFinished.bind(this));
			button.setText("Stop");
			isCutscenePlaying = true;
		}
	};
	
	p.onPaused = function(pauseStatus)
	{
		if(pauseStatus)
			cloudkid.Sound.instance.pauseAll();
		else
			cloudkid.Sound.instance.unpauseAll();
	};

	p.onResize = function(w, h)
	{
		if(button)
		{
			button.scaleX = button.scaleY = h / 500;
			button.x = this.display.width - button.width - 5;
			button.y = this.display.height - button.height - 5;
		}
		if(captionsText)
		{
			captionsText.scaleX = captionsText.scaleY = h / 500;
			captionsText.x = 450 * captionsText.scaleX;
			captionsText.y = 20 * captionsText.scaleY;
		}
	};
	
	namespace('cloudkid').CutsceneApp = CutsceneApp;
}());