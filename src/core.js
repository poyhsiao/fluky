import co from 'co';
import Dispatcher from './dispatcher';
import FEvent from './fevent';

function next() {
	return function(done) {
		done(null, true);
	};
}

class Core extends Dispatcher {

	constructor() {
		super();

		this.middlewares = [];
		this.handlers = [];
		this.wrapperMap = [];

		// Action
		this.use(function *(event, next) {

			if (event.type != 'action')
				return yield next();

			// Using customized handler if it exists
			if (this.hasListeners(event.path)) {
				yield this.emit.apply(this, event.args);
				return;
			}

			// Forwarding event to store
			var args = event.args.slice(0);
			args[0] = 'store.' + event.category + '.' + event.name;
			const e = new FEvent(args[0], args);

			this.internalDispatch(e);
		});

		// Dispatch events
		this.use(function *(event, next) {
			yield this.emit.apply(this, event.args);
		});
	}

	use() {
		this.middlewares.push(arguments[0].bind(this));
	}

	loadHandler(handler) {

		var exists = false;
		for (var index in this.handlers) {
			if (this.handlers[index] == handler) {
				exists = true;
				break;
			}
		}

		if (!exists) {
			co(handler.bind(this));
			this.handlers.push(handler);
		}
	}

	load() {

		for (var k in arguments) {
			var handler = arguments[k];

			// It's an array
			if (!(handler instanceof Function)) {
				var handlers = handler;

				for (var key in handlers) {
					this.loadHandler(handlers[key]);
				}
			}
		}
	}

	dispatch(eventStr) {
		const event = new FEvent(eventStr, arguments);

		this.internalDispatch(event);
	}

	internalDispatch(event) {

		// Using all middlewares to handle this event
		co(function *() {
			for (var index in this.middlewares) {
				var handler = this.middlewares[index];

				try {
					var isAlive = yield* handler(event, next);
				} catch(e) {
					console.log(e);
					break;
				}

				if (!isAlive)
					break;
			}
		}.bind(this));
	}

	off(eventName, listener) {

		// Find listener and remove its generator
		for (var index in this.wrapperMap) {
			var wrapper = this.wrapperMap[index];
			if (wrapper.listener == listener) {
				this.wrapperMap.splice(index, 1);
				super.off(eventName, wrapper.generator);
				return;
			}
		}

		super.off(eventName, listener);
	}

	bindListener(listener) {

		// Don't wrap again if it exists
		for (var index in this.wrapperMap) {
			var wrapper = this.wrapperMap[index];
			if (wrapper.listener == listener)
				return wrapper.generator;
		}

		// add to list
		var wrapper = {
			listener: listener,
			generator: function *() {
				listener.apply(this, Array.prototype.slice.call(arguments));
			}
		};

		this.wrapperMap.push(wrapper);

		return wrapper.generator;
	}
}

module.exports = Core;
