var isProd = (process.argv.indexOf('--production') >= 0);
var options = (isProd ? require("./webpack.dist.config.js") : require("./webpack.hot.config.js"));

module.exports = (function(options){
  var fs = require('fs'),
  version = fs.readFileSync("./VERSION"),
  path = require("path"),
  assign = require('object-assign'),
  webpack = require("webpack"),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  ExtractTextPlugin = require("extract-text-webpack-plugin"),
  CompressionPlugin = require("compression-webpack-plugin"),
  StatsPlugin = require('stats-webpack-plugin'),
  GZipPlugin = require('compression-webpack-plugin');

var globals = {
  React: 'react/addons',
  Router: 'react-router',
  Immutable: 'immutable',
  Bacon: 'baconjs',
  assign: 'object-assign',
  request: 'superagent',
  ProxyLoader: 'react-proxy-loader',
  ImmutableRenderMixin: 'react-immutable-render-mixin',
  moment: 'moment'
}

var baseConfig = {
  entry: {
    app: ['./src/main.js'],
    'libs': Object.keys(globals).map(function(k){ return globals[k]; })
  },

  output: {
    publicPath: '',
    path: 'dist/',
    filename: "[name].js",
    sourceMapFilename: '../../build/sourcemaps/[file].map',
    chunkFilename: "[name].js",
    libraryTarget: undefined,
    pathinfo: false
  },

  module:{
    noParse: [],
    preLoaders: [],
    loaders: [{
      /* convert all source files */
      test: /\.(js|jsx)$/,
      include: [/src/,/bower_components/],
      exclude: [/persistence/],
      loader: 'jsx?harmony!babel'
    }, {
      test: /\.(png|jpg)$/,
      loader: 'url?limit=8192',
    }, {
      /* Bundle CSS. */
      test: /\.css$/,
      exclude: /.(\-|\.)min.css$/,
      loader: 'style!css'
    }, {
      /* convert sass */
      test: /\.sass/,
      loader: 'style!css!sass?indentedSyntax=sass&includePaths[]=' + (__dirname, "./src")
    }, {
      /* Embed Fonts */
      test: /\.(eot|woff|ttf)$/,
      loader: 'file?name=[name].[ext]&context=/'
    }, {
      /* File Exporter to include any images */
      test: [/images\//],
      loader: 'url?limit=8192?name=assets/images/[name].[ext]'
    }, {
      /* File Exporter to include any images */
      test: [/images\//],
      loader: 'file?name=assets/images/[name].[ext]'
    }, {
      /* File Exporter to include index */
      test: [/index.html$/],
      loader: 'file?name=[name].html'
    }]
  },

  target: "web",

  resolveLoader: {
    root: [path.join(__dirname, "node_modules"), './src', 'vendor'],
  },

  resolve: {
    root: "app",
    extensions: ["", ".js", ".jsx"],
    /* allow for friendlier names to pull from preminimized files */
    alias: {
      'baconjs': 'baconjs/dist/Bacon.min.js'
    },
    /* allow for root relative names in require */
    modulesDirectories: ['bower_components', 'node_modules', 'src']
  },

  externals: [],

  plugins: [
    /* "Compiler" switches and embeding versioning. Dead code stripping will remove. */
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(version),
      __DEV__: JSON.stringify(JSON.parse(process.env.BUILD_DEV || 'false')),
      __PRERELEASE__: JSON.stringify(JSON.parse(process.env.BUILD_PRERELEASE || 'false'))
    }), /* BUILD_DEV=1 BUILD_PRERELEASE=1 webpack and `webpack -p` removes dead code */
    
    ],

  devServer: {
    contentBase: 'dist/',
    proxy: null,
    historyApiFallback: true,
    stats: {
      cached: false,
      exclude: [/node_modules/,/bower_components/]
    }
  },

  /* settings for jshint */
  jshint: {
    "globals": { "__DEV__": true }
  },
}


function runPostConfig(config, options) {
  updateEntry(config, options);

  updateBower(config, options);

  updateDevServer(config, options);
  
  updateLinting(config, options);

  updateLoaders(config, options);

  updateDebug(config, options);
  
  updatePrerender(config, options);
  
  updateLibs(config, options);
  
  updateCaching(config, options);

  updatePlugins(config, options);

  updateGlobals(config, options);
}

function updateEntry(config, options) {
  var entry = config.entry && config.entry.app || Object.keys(config.entry)
  entry[0] = (options.prerender ? "./config/prerender?" : "") + entry[0];
  if (options.hotComponents) {
    entry.unshift('webpack/hot/only-dev-server');
    entry.unshift('webpack-dev-server/client?http://localhost:8000');
  }
}

function updateBower(config, options){
  if (options.bower) {
    var mainFile = new webpack.ResolverPlugin.DirectoryDescriptionFilePlugin("bower.json", ["main"]);
    config.resolveLoader.root.unshift(path.join(__dirname, "bower_components"));
    config.plugins.push(new webpack.ResolverPlugin(mainFile));
  }
}

function updateLinting(config, options) {
  if (options.lint) {
    config.preLoaders.unshift({
      test: /\.(js|jsx)$/,
      include: [/src/],
      loader: 'jsxhint'
    });
  }
}

function updateLoaders(config, options) {
  config.module.noParse.push(/(\-|\.)min.js$/); /* don't parse minified files */
}

function updateDebug(config, options) {
  if (options.debug){
    config.output.pathinfo = true;
  }
}

function updateDevServer(config, options) {
  if (options.devServer) {
    config.output.publicPath = "http://localhost:8000/";
    config.output.chunkFilename = "[name]-[id].js";
  }

  if (options.proxy) {
    config.devServer.proxy = {'*': { target: 'http://localhost:8080' }};
  }

  if (options.hotComponents) {
    config.module.loaders.some(function(loader) {
      if(loader.loader.indexOf('jsx') === 0){
        loader.loader = 'react-hot!' + loader.loader;
        return true;
      };
      return false;
    })
    config.devServer.hot = true
    config.plugins.push(new webpack.HotModuleReplacementPlugin());
    // also include <script src="http://localhost:8000/webpack-dev-server.js"></script> in index.html
  }
}

function updatePrerender(config, options) {
  if (options.prerender) {
    config.target = "node";
    config.output.path = "prerender/js";
    config.output.libraryTarget = "libs";

    config.resolveLoader.alias["react-proxy$"] = "react-proxy/unavailable";
    config.externals.push(
      /^react(\/.*)?$/,
      "superagent"
    );

    Object.keys(config.module.loaders).map(function(loader) {
       if (loader.loader.indexOf('style') === 0) {
          if(options.prerender) {
            loader.loader = "null-loader";
          } else if (options.separateStylesheet) {
            loader.loader = ExtractTextPlugin.extract("style", loader.loader.slice(6));
          }
       }
     });
    if(options.separateStylesheet && !options.prerender) {
      plugins.push(new ExtractTextPlugin("[name].css" + (options.longTermCaching ? "?[contenthash]" : "")));
    }
  }
}

function updateLibs(config, options) {
  if(options.commonsChunk) {
    var name = "libs.js" + (options.longTermCaching && !options.prerender ? "?[chunkhash]" : "");
    config.plugins.push(new webpack.optimize.CommonsChunkPlugin("libs.js", name));
  }
}

function updateCaching(config, options) {
  if (options.longTermCaching && !options.prerender){
    config.output.filename += "?[chunkhash]";
    config.output.chunkFilename += "?[chunkhash]";
  }
}

function updatePlugins(config, options) {
  config.plugins.push(new HtmlWebpackPlugin({
    filename: 'index.html',
    template: 'src/assets/index.html'
  }));
  config.plugins.push(new webpack.PrefetchPlugin("react"));
  config.plugins.push(new webpack.PrefetchPlugin("react/lib/ReactComponentBrowserEnvironment"));

  if(options.minimize) {
    config.plugins.push(
      new webpack.optimize.UglifyJsPlugin({compress:{warnings:false}}),
      new webpack.optimize.DedupePlugin(),
      new webpack.DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify("production")
        },
        __DEV__: JSON.stringify(JSON.parse(process.env.BUILD_DEV || 'false')),
        __version__: version
      }),
      new webpack.NoErrorsPlugin()
    );
  }

  if(options.gzip) {
    config.plugins.push(new CompressionPlugin({asset: "{file}.gz",regExp: /\.js$|\.css$|\.html$/}));
  }

  if (options.stats) {
    config.plugins.push(new StatsPlugin(path.join(__dirname, 'build', 'stats.json'), {
      chunkModules: true,
      exclude: [/node_modules/]
    }));
  }
}

function updateGlobals(config, options) {
  var libs = new webpack.ProvidePlugin(globals);
  config.plugins.push(libs);
  config.jshint.globals = assign(config.jshint.globals, globals);
}

runPostConfig(baseConfig, options);
return baseConfig;

}(options));