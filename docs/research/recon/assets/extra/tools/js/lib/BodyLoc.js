class Enum extends Array {
	static resolve() {
		if(!window.__enum__) {
			window.__enum__ = {};
		}
		window.__enum__[this.name] = this;
	}
	toString() {
		return this[0];
	}
}

class BodyLoc extends Enum {
	//static __construct__ = ["HEAD", "TORSO_LEFT", "TORSO_RIGHT", "STOMACH", "ARM_LEFT", "ARM_RIGHT", "LEG_LEFT", "LEG_RIGHT"];
	static HEAD        = new this("HEAD",        0);
	static TORSO_LEFT  = new this("TORSO_LEFT",  1);
	static TORSO_RIGHT = new this("TORSO_RIGHT", 2);
	static STOMACH     = new this("STOMACH",     3);
	static ARM_LEFT    = new this("ARM_LEFT",    4);
	static ARM_RIGHT   = new this("ARM_RIGHT",   5);
	static LEG_LEFT    = new this("LEG_LEFT",    6);
	static LEG_RIGHT   = new this("LEG_RIGHT",   7);
}
BodyLoc.resolve();