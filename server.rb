#!/usr/bin/env ruby
# air-bitrage — a peer-to-peer marketplace for airline travel preferences.
# Ruby stdlib only (webrick + json), no gems to install.
#
#   ruby server.rb          →  http://localhost:4747
#   PORT=8080 ruby server.rb

require 'webrick'
require 'json'
require 'fileutils'
require 'date'
require 'time'

PORT = ENV.fetch('PORT', '4747').to_i
ROOT = __dir__
DATA_FILE = File.join(ROOT, 'data', 'db.json')
CATEGORIES = %w[seat-swap recline rebooking lounge upgrade other].freeze
KINDS = %w[offer request].freeze

class ApiError < StandardError
  attr_reader :status

  def initialize(message, status = 400)
    super(message)
    @status = status
  end
end

# All state lives in data/db.json. Writes go through #write, which holds a
# mutex (webrick is threaded) and persists atomically via write-tmp-then-rename.
class Store
  def initialize(file)
    @file = file
    @mutex = Mutex.new
    FileUtils.mkdir_p(File.dirname(file))
    if File.exist?(file)
      @data = JSON.parse(File.read(file))
    else
      @data = { 'nextId' => 1, 'listings' => [] }
      seed
      persist
    end
  end

  def listings
    @data['listings']
  end

  def find(id)
    listings.find { |l| l['id'] == id }
  end

  def next_id
    id = @data['nextId']
    @data['nextId'] += 1
    id
  end

  def write
    @mutex.synchronize do
      result = yield
      persist
      result
    end
  end

  private

  def persist
    tmp = "#{@file}.tmp"
    File.write(tmp, JSON.pretty_generate(@data))
    File.rename(tmp, @file)
  end

  # An example flight board (clearly-fake flight number, marked demo) so the
  # app isn't empty on first launch. Shown separately from real boards.
  def seed
    date = (Date.today + 3).iso8601
    demo = [
      { category: 'seat-swap', kind: 'request', price: 20, name: 'Dana', seat: '20C',
        title: 'Family of 3 split across rows 20, 24, 31 — help us sit together',
        details: 'Two kids (4 and 7) and one very tired parent. We have 20C, 24E, and 31A ' \
                 'and would love any block of seats near each other. $20 per seat moved.' },
      { category: 'recline', kind: 'offer', price: 15, name: 'Priya', seat: '9C',
        title: 'Will pay you $15 to keep seat 8C upright the whole flight',
        details: "I'm in 9C with a laptop and a deadline. Keep your seat upright gate to gate " \
                 'and the money is yours at the jet bridge.' },
      { category: 'rebooking', kind: 'offer', price: 150, name: 'Marcus', seat: '14B',
        title: 'Will take the later flight for $150 — save yourself the bump lottery',
        details: "Flexible plans, no checked bag. If the flight is oversold or you're stuck on " \
                 "standby, I'll volunteer my seat for $150 (or a voucher worth more)." },
      { category: 'lounge', kind: 'offer', price: 25, name: 'Jules', seat: '3A',
        title: 'Extra lounge day pass — $25 (they are $59 at the door)',
        details: 'Guest pass expires this month. Meet me near gate B22 before boarding.' },
      { category: 'upgrade', kind: 'request', price: nil, name: 'Sam', seat: '27E',
        title: 'Anyone with a confirmed upgrade they will not use? Will split the value',
        details: "6'5\" and in a middle seat. If you have an upgrade certificate or miles " \
                 "you'd part with, I'll pay half of face value in cash." }
    ]
    demo.each do |d|
      listings << {
        'id' => next_id,
        'demo' => true,
        'flight' => 'UA5555', 'date' => date,
        'category' => d[:category], 'kind' => d[:kind],
        'title' => d[:title], 'details' => d[:details],
        'name' => d[:name], 'seat' => d[:seat], 'price' => d[:price],
        'status' => 'open', 'replies' => [], 'acceptedReplyId' => nil, 'deal' => nil,
        'createdAt' => Time.now.utc.iso8601
      }
    end
    listings.first['replies'] << {
      'id' => next_id, 'name' => 'Alex', 'seat' => '21B', 'price' => nil,
      'message' => "I'm in 21B and 21A was empty at check-in — I'll move to 24E so you can " \
                   'have 20C + 21A + 21B. Close enough to count?',
      'createdAt' => Time.now.utc.iso8601
    }
  end
end

STORE = Store.new(DATA_FILE)

# ---------- helpers ----------

def norm_flight(s)
  s.to_s.upcase.gsub(/\s+/, '')
end

def valid_date?(s)
  Date.iso8601(s.to_s)
  true
rescue ArgumentError, TypeError
  false
end

def parse_price(v)
  return nil if v.nil? || v.to_s.strip.empty?
  n = begin
    Float(v.to_s.strip.sub(/\A\$/, ''))
  rescue ArgumentError
    raise ApiError, 'price must be a number'
  end
  raise ApiError, 'price cannot be negative' if n.negative?
  n.round(2)
end

def find_listing!(id)
  listing = STORE.find(Integer(id, exception: false) || -1)
  raise ApiError.new('listing not found', 404) unless listing
  listing
end

def json_out(res, obj, status = 200)
  res.status = status
  res['Content-Type'] = 'application/json'
  res.body = JSON.generate(obj)
end

# ---------- API handlers ----------

def public_flights
  boards = {}
  STORE.listings.each do |l|
    next if l['status'] == 'closed'
    board = boards[[l['flight'], l['date']]] ||=
      { 'flight' => l['flight'], 'date' => l['date'], 'open' => 0, 'deals' => 0, 'demo' => true }
    board[l['status'] == 'open' ? 'open' : 'deals'] += 1
    board['demo'] &&= l['demo'] == true
  end
  boards.values.sort_by { |b| [b['date'], b['flight']] }
end

def get_listings(req)
  flight = norm_flight(req.query['flight'])
  date = req.query['date'].to_s
  raise ApiError, 'flight and date query params are required' if flight.empty? || date.empty?
  STORE.listings
       .select { |l| l['flight'] == flight && l['date'] == date }
       .sort_by { |l| -l['id'] }
end

def create_listing(b)
  flight = norm_flight(b['flight'])
  raise ApiError, 'flight number is required' if flight.empty?
  raise ApiError, 'flight number looks wrong — try something like UA1492' unless flight.match?(/\A[A-Z0-9]{2,8}\z/)
  raise ApiError, 'date must be YYYY-MM-DD' unless valid_date?(b['date'])
  raise ApiError, "category must be one of: #{CATEGORIES.join(', ')}" unless CATEGORIES.include?(b['category'])
  raise ApiError, 'kind must be offer or request' unless KINDS.include?(b['kind'])
  title = b['title'].to_s.strip
  name = b['name'].to_s.strip
  raise ApiError, 'title is required' if title.empty?
  raise ApiError, 'name is required' if name.empty?
  price = parse_price(b['price'])

  STORE.write do
    listing = {
      'id' => STORE.next_id,
      'demo' => false,
      'flight' => flight, 'date' => b['date'],
      'category' => b['category'], 'kind' => b['kind'],
      'title' => title, 'details' => b['details'].to_s.strip,
      'name' => name, 'seat' => b['seat'].to_s.strip.upcase, 'price' => price,
      'status' => 'open', 'replies' => [], 'acceptedReplyId' => nil, 'deal' => nil,
      'createdAt' => Time.now.utc.iso8601
    }
    STORE.listings << listing
    listing
  end
end

def add_reply(id, b)
  name = b['name'].to_s.strip
  message = b['message'].to_s.strip
  raise ApiError, 'name is required' if name.empty?
  raise ApiError, 'message is required' if message.empty?
  price = parse_price(b['price'])

  STORE.write do
    listing = find_listing!(id)
    raise ApiError, 'this listing is no longer open' unless listing['status'] == 'open'
    listing['replies'] << {
      'id' => STORE.next_id, 'name' => name, 'seat' => b['seat'].to_s.strip.upcase,
      'message' => message, 'price' => price, 'createdAt' => Time.now.utc.iso8601
    }
    listing
  end
end

def accept_deal(id, b)
  STORE.write do
    listing = find_listing!(id)
    raise ApiError, 'this listing is no longer open' unless listing['status'] == 'open'
    reply = listing['replies'].find { |r| r['id'] == b['replyId'] }
    raise ApiError.new('reply not found', 404) unless reply

    price = reply['price'] || listing['price']
    listing['status'] = 'deal'
    listing['acceptedReplyId'] = reply['id']
    listing['deal'] = {
      'with' => reply['name'], 'price' => price,
      'closedAt' => Time.now.utc.iso8601
    }
    listing
  end
end

def close_listing(id)
  STORE.write do
    listing = find_listing!(id)
    raise ApiError, 'this listing is not open' unless listing['status'] == 'open'
    listing['status'] = 'closed'
    listing
  end
end

# ---------- router ----------

def handle_api(req, res)
  parts = req.path.sub(%r{\A/api/?}, '').split('/').reject(&:empty?)
  body = {}
  if req.request_method == 'POST' && req.body && !req.body.empty?
    body = JSON.parse(req.body)
    raise ApiError, 'request body must be a JSON object' unless body.is_a?(Hash)
  end

  result =
    case [req.request_method, *parts]
    in ['GET', 'flights'] then public_flights
    in ['GET', 'listings'] then get_listings(req)
    in ['POST', 'listings'] then create_listing(body)
    in ['GET', 'listings', id] then find_listing!(id)
    in ['POST', 'listings', id, 'replies'] then add_reply(id, body)
    in ['POST', 'listings', id, 'accept'] then accept_deal(id, body)
    in ['POST', 'listings', id, 'close'] then close_listing(id)
    else raise ApiError.new('not found', 404)
    end
  json_out(res, result)
rescue JSON::ParserError
  json_out(res, { 'error' => 'invalid JSON body' }, 400)
rescue ApiError => e
  json_out(res, { 'error' => e.message }, e.status)
end

server = WEBrick::HTTPServer.new(
  BindAddress: ENV.fetch('BIND', '127.0.0.1'),
  Port: PORT,
  DocumentRoot: File.join(ROOT, 'public'),
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)
server.mount_proc('/api') { |req, res| handle_api(req, res) }
trap('INT') { server.shutdown }

puts "air-bitrage ✈  the marketplace for the gate and beyond"
puts "listening on http://localhost:#{PORT}"
server.start
