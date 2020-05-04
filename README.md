
<p align="center">

<img src="https://d25hn4jiqx5f7l.cloudfront.net/companies/logos/thumb/paperspace_1536862891.png?1536862891" width="150">

</p>


# Homebridge Paperspace

<span align="center">

This [Homebridge](https://github.com/homebridge/homebridge) plugin connects [Apple HomeKit](https://en.wikipedia.org/wiki/HomeKit) to your [Paperspace](https://www.paperspace.com) account so you can manage your Paperspace machines.

</span>

## Installation

- Install [config-ui-x](https://github.com/oznu/homebridge-config-ui-x).
- Search for "Paperspace" on the plugin screen of [config-ui-x](https://github.com/oznu/homebridge-config-ui-x).
- Click install.

### Manual Installation

If you're not using [config-ui-x](https://github.com/oznu/homebridge-config-ui-x), run
```
npm install -g --unsafe-perm homebridge-paperspace
```

## Configuration

You will need a [Paperspace API Key](https://www.paperspace.com/console/account/api) to manage your Paperspace account.

In your Homebridge `config.json`, add the following config:
```
"platforms": [
  {
      "platform": "Paperspace",
      "name": "Paperspace",
      "apiKey": "<YOUR-API-KEY-HERE>"
  }
]
```