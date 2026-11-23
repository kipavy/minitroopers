class ClientMode extends Enum {
	static __construct__ = ["eU\\u\x01", "F\fN\x02\x01", "\x1b\x11L\x1c\x02", "w{1\x01\x03", "R;,'\x01", "*!,\x05\x02"];
	/*
	 * @param Object arg0 : ???
	 * @param Int arg1 : ???
	 */
	static 'eU\\u\x01'(arg0, arg1)         { return new this("eU\\u\x01",         0, arg0, arg1); }
	/*
	 * @param Object arg0 : ???
	 */
	static 'F\fN\x02\x01'(arg0)            { return new this("F\fN\x02\x01",            1, arg0); }
	/*
	 * @param Object arg0 : ???
	 * @param Int arg1 : ???
	 */
	static '\x1b\x11L\x1c\x02'(arg0, arg1) { return new this("\x1b\x11L\x1c\x02", 2, arg0, arg1); }
	/*
	 * @param String arg0  : ???
	 */
	static 'w{1\x01\x03'(arg0)             { return new this("w{1\x01\x03",             3, arg0); }
	/*
	 * @param Object arg0 : ???
	 */
	static 'R;,\'\x01'(arg0)               { return new this("R;,'\x01",                4, arg0); }
	/*
	 * @param Object arg0 : ???
	 * @param Int arg1 : ???
	 * @param Object arg2 : ???
	 */
	static '*!,\x05\x02'(arg0, arg1, arg2) { return new this("*!,\x05\x02", 5, arg0, arg1, arg2); }
}
ClientMode.resolve();