class TrooperType extends Enum {
	static __construct__ = ["HUMAN", "PUPPET", "RAT"];
	static HUMAN  = new this("HUMAN",  0);
	static PUPPET = new this("PUPPET", 1);
	static RAT    = new this("RAT",    2);
}
TrooperType.resolve();