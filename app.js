"use strict";

function Scope() {
	this.$$registredWatchers = [];								//array of registred watchers
	this.$$phase = null;										//active angular phase
	this.$$postDigestQueue = [];								//Queue expressions, that will call after Digest run
    this.$$asyncQueue = [];										//Queue for async run expressions
};

function Watcher(watchExpression, listener, objectEquality) {  //class of watcher.
	this.$$watchExpression = watchExpression; 					// Expression, that listening on changes
	this.$$listener = listener;									// function that run on changes
	this.$$objectEquality = !!objectEquality;					// Deep comparing
};

function WatcherGroup(watchExpressions, listener, objectEquality) {	//class of watcher.
	this.$$watchExpressions = watchExpressions;						// Expressions, that listening on changes
	this.$$listener = listener;										// function that run on changes
	this.$$objectEquality = !!objectEquality;						// Deep comparing
};

WatcherGroup.prototype.$getValues = function(){								//Get values of watcher expressions
	var values = _.flatMap(this.$$watchExpressions, this.$eval);
	return values;
};

Scope.prototype.$resetPhase = function(){										//reset of angular phase
	this.$$phase = null;
};

Scope.prototype.$setPhase = function(phase){									//set of angular phase
	if(_.isEmpty(this.$phase)){
		this.$$phase = phase;
	} else {
		throw "Angular is busy by " + this.$phase;
	}
};

Scope.prototype.$apply = function(expression) {						//apply method for expressions
	try {
		this.$setPhase("apply");									//set "apply" phase
		return this.$eval(expression);
	} finally {
	  this.$resetPhase();
	  this.$digest();
	}
};

Scope.prototype.$watchGroup = function(watchFns ,listenerFn, valueEq ){	//function for setup watch expressions
	var me = this, index;
	if(_.isArray(watchFns)){										//check that value is empty. 
		var watcher = new WatcherGroup(watchFns ,listenerFn, valueEq);
		index = this.$$registredWatchers.push(watcher);
	} else {
		throw "watchFns is mandatory array parameter";
	}
	return function(){
		me.$$registredWatchers.splice(index - 1, 1);
	}
};

Scope.prototype.$watch  = function(watchFn ,listenerFn, valueEq ){	//function for setup watch expressions
	var me = this, index;
	if(_.isFunction(watchFn)){										//check that value is empty. 
		var watcher = new Watcher(watchFn ,listenerFn, valueEq);	//create new watcher
		index = this.$$registredWatchers.push(watcher);
	} else {
		throw "watchFn is mandatory function parameter";
	}
	return function(){
		me.$$registredWatchers.splice(index - 1, 1);
	}
};

Scope.prototype.$digest = function(){								//circle in watchExpressions
	var maxIterations = 20;											//max iterations for circle
	this.$setPhase("digest");									//set digest phase
	try {
		var watchers = this.$$registredWatchers;
		while(this.$changesChecker() && watchers.length){			
			if(!(maxIterations--)) {
				throw "Digest iterations overflow";
			}
		}
	} finally {
		this.$resetPhase();
		this.$postDigestEval();
	}
};



Scope.prototype.$isEqual = function(newValue, oldValue){
	return newValue == oldValue || (typeof newValue === 'number' && typeof oldValue === 'number' &&
       isNaN(newValue) && isNaN(oldValue));
}

Scope.prototype.$changesChecker = function(){
	var me = this,
		haveChanges = false;
		this.$runAsyncQueue();
	_.forEach(this.$$registredWatchers, function(watcher) {
		try {
			var newValue = (watcher instanceof Watcher ? me.$eval(watcher.$$watchExpression) : watcher.$getValues()),
				oldValue = watcher.oldValue;
			if((watcher.$$objectEquality ? !_.isEqual(newValue, oldValue) : !me.$isEqual(newValue, oldValue))){
				watcher.oldValue = watcher.$$objectEquality ? _.cloneDeep(newValue) : newValue;
				haveChanges = true;
				watcher.$$listener(newValue, oldValue, me);
			}
		} catch	(err) {
			console.error("Digest error: " + err);
		}
	});
	return haveChanges;
}


Scope.prototype.$evalAsync = function(expression) {
	var me = this;
	try {
		expression && this.$$asyncQueue.push(expression);
		if (!this.$$phase) {
			setTimeout(function() {
				me.$digest();
			}, 0);
		}
	} catch (err) {
		console.error(err);
	}
};

Scope.prototype.$runAsyncQueue = function(expression) {
	while(this.$$asyncQueue.length){
		this.$eval(this.$$asyncQueue.shift()); 			//eval async expressions
	}
}		

Scope.prototype.$postDigestEval = function(){
	try{
		while (this.$$postDigestQueue.length){ 
			this.$eval(this.$$postDigestQueue.shift());
		}
	} catch(err) {
		console.error("postDigest error: " + err);
	}
}

Scope.prototype.$$postDigest = function(expression) {
	this.$$postDigestQueue.push(expression);
};

Scope.prototype.$eval = function(expression, values) {
	try{
		if (_.isFunction(expression)){								//check that expression is functions. Else just start $digest
			return !!values ? expression(values) : expression(this);
		}
	} catch(err) {
		console.error("Expression eval error: " + err);
	}
};