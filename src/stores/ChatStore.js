import { log } from 'utils';
import { createStore } from 'redux';
import SortedMap from 'collections/sorted-map';

const DEFAULT_STATE = {
	connection: 'closed',
	account_status: 'offline',
	departments: [],
	visitor: {},
	agents: {},
	chats: SortedMap(),
	is_chatting: false,
	last_non_visitor_msg_ts: 0
};

let isAgent = (nick) => { return nick.startsWith('agent:') };
let isVisitor = (nick) => { return nick.startsWith('visitor') };

// IMPT: Need to return on every case
function update(state = DEFAULT_STATE, action) {
	log('action', action);
	switch (action.type) {
		case 'connection_update':
			return {
				...state,
				connection: action.detail
			};
		case 'account_status':
			return {
				...state,
				account_status: action.detail
			};
		case 'department_update':
			return {
				...state,
				departments: action.detail
			};
		case 'visitor_update':
			return {
				...state,
				visitor: {
					...state.visitor,
					...action.detail
				}
			};
		case 'agent_update':
			return {
				...state,
				agents: {
					...state.agents,
					[action.detail.nick]: {
						...action.detail,
						nick: action.detail.nick, // To be removed after standardization
						typing: (state.agents[action.detail.nick] || {typing: false}).typing
					}
				}
			};
		case 'chat':
			let new_state = { ...state };
			switch (action.detail.type) {
				/* Web SDK events */
				case 'chat.memberjoin':
					if (isAgent(action.detail.nick)) {
						if (!new_state.agents[action.detail.nick]) new_state.agents[action.detail.nick] = {};
						new_state.agents[action.detail.nick].nick = action.detail.nick;
					}
					else
						new_state.visitor.nick = action.detail.nick;

					if (!isAgent(action.detail.nick)) {
						new_state.is_chatting = true;
					}

					// Concat this event to chats to be displayed
					new_state.chats = state.chats.concat({
						[Date.now()]: {
							...action.detail
						}
					});

					return new_state;
				case 'chat.memberleave':
					if (!isAgent(action.detail.nick)) {
						new_state.is_chatting = false;
					}

					// Concat this event to chats to be displayed
					new_state.chats = state.chats.concat({
						[Date.now()]: {
							...action.detail
						}
					});

					return new_state;
				case 'chat.file':
				case 'chat.wait_queue':
				case 'chat.request.rating':
				case 'chat.msg':
					const detail =  action.detail

					new_state.chats = state.chats.concat({
						[Date.now()]: {
							...detail,
							...member(state, detail)
						}
					});

					// store last timestamp of message log that is not sent by visitor
					if (!isVisitor(detail.nick)) {
						new_state.last_non_visitor_msg_ts = detail.timestamp
					}

					return new_state;
				case 'typing':
					return {
						...state,
						agents: {
							...state.agents,
							[action.detail.nick]: {
								...state.agents[action.detail.nick],
								typing: action.detail.typing
							}
						}
					};
				default:
					return state;
			}
		default:
			log('unhandled action', action);
			return state;
	}
}

function member(state, detail) {
	const
		nick = detail.nick,
		display_name = detail.display_name;
	if (isAgent(nick)) {
		const trigger_agent = {
	      nick: nick,
	      display_name: display_name,
	      avatar_path: ''
	    };
		return {
			...(state.agents[nick] ? state.agents[nick] : trigger_agent),
			member_type: 'agent'
		}
	} else {
		return {
			...state.visitor,
			member_type: 'visitor'
		}
	}
}

function storeHandler(state = DEFAULT_STATE, action) {
	let result, new_action = {};
	if (action.type === 'synthetic') {
		log('synthetic action', action);
		switch (action.detail.type) {
			case 'visitor_send_msg':
				new_action = {
					type: 'chat',
					detail: {
						type: 'chat.msg',
						display_name: state.visitor.display_name,
						nick: state.visitor.nick || 'visitor:',
						timestamp: Date.now(),
						msg: action.detail.msg,
						source: 'local'
					}
				};
				break;
			case 'visitor_send_file':
				new_action = {
					type: 'chat',
					detail: {
						type: 'chat.file',
						display_name: state.visitor.display_name,
						nick: state.visitor.nick || 'visitor:',
						timestamp: Date.now(),
						attachment: action.detail.attachment,
						source: 'local'
					}
				}
				break;
			default:
				new_action = action;
		}

		result = update(state, new_action);
	} else {
		result = update(state, action);
	}

	return result;
}

// Create a Redux store holding the state of your app.
// Its API is { subscribe, dispatch, getState }.
// let ChatStore = createStore(update, applyMiddleware(chatMiddleware));
let ChatStore = createStore(storeHandler, window.devToolsExtension && window.devToolsExtension());

export default ChatStore;