function(keys, values, rereduce) {
	var doc = values.pop();
	published_on = [];
	for (key in keys) {
		if (keys[key][0] != keys[key][1]) {
			published_on.push(keys[key][1]);
		}
	}
	return published_on.length;
}