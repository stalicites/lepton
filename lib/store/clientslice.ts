import { createSlice, CreateSliceOptions, PayloadAction, SliceCaseReducers } from "@reduxjs/toolkit";
import { client } from "../client";

export const clientSlice = createSlice({
	name: "Client",
	initialState: {
		username: "",
		isSignedIn: false,
		userId: "",
		avatar: "",
		accounts: ((typeof localStorage!=="undefined"&&localStorage.getItem("accounts")) ? JSON.parse(localStorage.getItem("accounts")!) : []) as string[],
	},
	reducers: {
		addAccount(state, action: PayloadAction<string>) {
			state.accounts = [...state.accounts, action.payload].filter((e, i, a) => a.indexOf(e) === i);
			localStorage.setItem("accounts", JSON.stringify(state.accounts));
		},
		removeAccount(state, action: PayloadAction<string>) {
			state.accounts = state.accounts.filter((e) => e !== action.payload);
			localStorage.setItem("accounts", JSON.stringify(state.accounts));
		},
		removeAllAccounts(state) {
			state.accounts = [];
			localStorage.setItem("accounts", JSON.stringify(state.accounts));
		},
		onClientUserChanged(state, action: PayloadAction){
			if (client.clientUser) {
				state.username = client.clientUser.username;
				state.isSignedIn = true;
				state.userId = client.clientUser.id.toString();
				state.avatar = client.clientUser.avatar;
				localStorage.setItem("currentAccount", client.token!);
			} else {
				// state.username = ""; not necessary
				state.isSignedIn = false;
				state.userId = ""
				localStorage.removeItem("currentAccount");
			}
		}
	}
});

export const { onClientUserChanged, addAccount, removeAccount, removeAllAccounts } = clientSlice.actions;