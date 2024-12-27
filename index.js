//Import dependencies
import {
	AutojoinRoomsMixin,
	MatrixClient,
	SimpleFsStorageProvider,
	RichRepliesPreprocessor,
} from "matrix-bot-sdk";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

//Parse YAML configuration file
const loginFile = readFileSync("./db/login.yaml", "utf8");
const loginParsed = parse(loginFile);
const homeserver = loginParsed["homeserver-url"];
const accessToken = loginParsed["login-token"];
const prefix = loginParsed.prefix;
const msgLimit = loginParsed["msg-limit"];

//keep track of whos ranting
const rants = new Map();

//the bot sync something idk bro it was here in the example so i dont touch it ;-;
const storage = new SimpleFsStorageProvider("bot.json");

//login to client
const client = new MatrixClient(homeserver, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

//do not include replied message in message
client.addPreprocessor(new RichRepliesPreprocessor(false));

const filter = {
	//dont expect any presence from m.org, but in the case presence shows up its irrelevant to this bot
	presence: { senders: [] },
	room: {
		//ephemeral events are never used in this bot, are mostly inconsequentail and irrelevant
		ephemeral: { senders: [] },
		//we fetch state manually later, hopefully with better load balancing
		state: {
			senders: [],
			types: [],
			lazy_load_members: true,
		},
		//we dont need much room history, just enough to catch recent messages just before the bot came online
		timeline: {
			limit: 1000,
		},
	},
};

//Start Client
client.start(filter).then(async (filter) => {
	console.log("Client started!");
});

//when the client recieves an event
client.on("room.event", async (roomId, event) => {
	//ignore events sent by self, unless its a banlist policy update
	if (event.sender === client.getUserId()) {
		return;
	}

	if (
		event.type === "m.room.member" &&
		event.content?.membership !== "leave" &&
		event.content?.membership !== "ban" &&
		event.content?.displayname &&
		[...event.content.displayname].some((char) => char.charCodeAt(0) > 127)
	) {
		try {
			await client.redactEvent(
				roomId,
				event.event_id,
				"non-ascii characters are not allowed due to bifrost",
			);
			await client.sendMessage(roomId, {
				body: `${event.sender} non-ascii characters break bridging and are not allowed.`,
				"m.mentions": {
					user_ids: [event.sender],
				},
				msgtype: "m.text",
			});
		} catch (e) {
			console.error("could not perform action in", roomId);
		}
	}
});
